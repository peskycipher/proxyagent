import { requireUser, unauthorized } from "@/lib/route-session";
import { touchModelActivity, beginModelStream } from "@/lib/inference";
import {
  billedStreamGate,
  BilledStream,
  openAiSseDelta,
  persistAssistantMessage,
} from "@/lib/billed-stream";
import { getDb, newId } from "@/lib/db";
import { track } from "@/lib/telemetry";
import { llamaBase } from "@/lib/vast";

/**
 * OpenAI-compatible proxy in front of llama-server for the mirrored llama.cpp
 * WebUI (public/llama-ui, an exact SvelteKit static build fetched from the
 * pod's tunnel). The WebUI resolves API endpoints RELATIVE to its page path
 * (bundle: COMPLETIONS:"./v1/chat/completions"), so every pod API call lands
 * here under /llama-ui/<path>.
 *
 * The pod's real API key (LLAMA_API_KEY / --api-key on llama-server) is
 * injected SERVER-SIDE: the browser never holds it, so /llama-ui can never be
 * reused as free model access — every request is gated exactly like /api/chat.
 */

/** The pod's llama-server --api-key, injected server-side (never sent to browsers). */
function upstreamKey(): string {
  return process.env.LLAMA_API_KEY ?? "";
}

const up = async (path: string, init?: RequestInit): Promise<Response> => {
  const base = await llamaBase();
  return fetch(`${base}/${path}`, init);
};

const upstreamAuth = async (
  extra?: Record<string, string>,
): Promise<Record<string, string>> => {
  const key = upstreamKey();
  return {
    authorization: `Bearer ${key}`,
    ...(extra ?? {}),
  };
};

/** Authenticated 1:1 passthrough for non-billing endpoints (props, models, tokenize…). */
async function passthrough(
  request: Request,
  llamaPath: string,
  method: string,
): Promise<Response> {
  const init: RequestInit = { method, headers: await upstreamAuth() };
  if (method !== "GET" && method !== "HEAD") {
    init.body = await request.arrayBuffer();
    init.headers = await upstreamAuth({
      "content-type": request.headers.get("content-type") ?? "application/json",
    });
  }
  const res = await up(llamaPath, init);
  return new Response(res.body, {
    status: res.status,
    headers: passthroughHeaders(res),
  });
}

function passthroughHeaders(res: Response): Headers {
  const h = new Headers();
  const ct = res.headers.get("content-type");
  if (ct) h.set("content-type", ct);
  h.set("cache-control", "no-store");
  return h;
}

interface ChatMsg {
  role: string;
  content?: string | Array<{ type: string; text?: string }>;
}

/** Last user message of a chat-completions body (for the thread audit row). */
function lastUserText(messages: ChatMsg[] | undefined): string {
  if (!Array.isArray(messages)) return "";
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m?.role !== "user") continue;
    if (typeof m.content === "string") return m.content;
    if (Array.isArray(m.content)) {
      const joined = m.content.map((p) => p.text ?? "").join(" ");
      if (joined) return joined;
    }
  }
  return "";
}

const billingPaths = new Set(["v1/chat/completions", "v1/completions"]);

export async function POST(
  request: Request,
  ctx: { params: Promise<{ llamaPath: string[] }> },
): Promise<Response> {
  const user = await requireUser();
  if (!user) return unauthorized();
  const userId = user.id;

  const llamaPath = (await ctx.params).llamaPath.join("/");
  if (billingPaths.has(llamaPath)) {
    return proxyBillingCompletion(request, userId, llamaPath);
  }
  return passthrough(request, llamaPath, "POST");
}

export async function GET(
  request: Request,
  ctx: { params: Promise<{ llamaPath: string[] }> },
): Promise<Response> {
  const user = await requireUser();
  if (!user) return unauthorized();
  const llamaPath = (await ctx.params).llamaPath.join("/");
  // WebUI fetches props via GET. Inject auth instead of trusting the client.
  // llama-server's built-in tools are AS ROOT on the pod — they are never
  // exposed to tenants; short-circuit the WebUI's tools fetch with an empty
  // list so its console error goes away without enabling the feature.
  if (llamaPath === "tools") {
    // ToolsStore maps over the RAW response body (e.map(r=>r.definition)) —
    // the response must be a bare JSON array, not {object,tools}.
    return Response.json([], { headers: { "cache-control": "no-store" } });
  }
  return passthrough(request, llamaPath, "GET");
}

/**
 * Billing-gated pass-through of an OpenAI streaming completion.
 * Lifecycle (per-user lock, balance gate, stop-loss capped at pre-stream
 * balance, lease touches, page-clock pause/resume, metered debit) lives in
 * lib/billed-stream.ts, identical to /api/chat. Differences from /api/chat:
 * the SSE payload is passed through byte-identical (the WebUI is a native
 * OpenAI SSE client), and threads live browser-side — we persist only a flat
 * audit transcript (one chat row per completion).
 */
async function proxyBillingCompletion(
  request: Request,
  userId: string,
  llamaPath: string,
): Promise<Response> {
  // One stream per account + credit gate, shared with /api/chat.
  const gate = await billedStreamGate("llamaproxy", userId);
  if (gate instanceof Response) return gate;
  const balance = gate.balance;

  const rawBody = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!rawBody)
    return Response.json({ error: "invalid request" }, { status: 400 });
  const userText = lastUserText(rawBody.messages as ChatMsg[] | undefined);

  const db = await getDb();
  const chatId = newId("chat");
  await db.run(
    "INSERT INTO chats (id, user_id, title, created_at) VALUES (?,?,?,?)",
    chatId,
    userId,
    userText.slice(0, 60) || "proxy chat",
    Date.now(),
  );
  if (userText) {
    await db.run(
      "INSERT INTO messages (id, chat_id, role, content, created_at) VALUES (?,?,?,?,?)",
      newId("msg"),
      chatId,
      "user",
      userText.slice(0, 16000),
      Date.now(),
    );
  }

  // Lifecycle (stop-loss abort, lock/lease heartbeat, metered debit, page-clock
  // resume, lock release) lives in lib/billed-stream.ts; this route supplies
  // only the audit-row persistence and completed event via the finalize callback.
  const bs = new BilledStream({
    source: "llamaproxy",
    userId,
    chatId,
    balance,
    debitRef: `llamaproxy:${chatId}`,
  });
  const startedAt = Date.now();
  let assistantContent = "";

  const cleanup = async () => {
    await bs.cleanup(async (billed) => {
      await persistAssistantMessage(
        db,
        chatId,
        assistantContent.slice(0, 16000),
        billed,
      );
      track("llamaproxy.completed", {
        "app.user.id": userId,
        "app.chat.id": chatId,
        "app.chat.billed_seconds": billed,
        "app.chat.duration_ms": Date.now() - startedAt,
      });
    });
  };

  const upstream = await fetch(`${await llamaBase()}/${llamaPath}`, {
    method: "POST",
    headers: await upstreamAuth({ "content-type": "application/json" }),
    body: JSON.stringify(rawBody),
    signal: bs.aborter.signal,
  });

  if (!upstream.ok || !upstream.body) {
    track("llamaproxy.failed", {
      "app.chat.id": chatId,
      "app.upstream_status": upstream.status,
    });
    await bs.cleanup(); // no meter yet — teardown only
    return new Response(upstream.body, {
      status: upstream.status,
      headers: passthroughHeaders(upstream),
    });
  }

  // Warmup has to have happened BEFORE the model call for billing parity with
  // /api/chat — but llama-server already accepted the stream. Warmup here is
  // a no-op confirmation (pod is up because the upstream responded); the pod
  // lifecycle lease is registered for the full request.
  beginModelStream(userId);

  const decoder = new TextDecoder();
  const passthroughStream = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      touchModelActivity();
      bs.startMetering(); // no-op after the first chunk; freezes the page-open meter
      // Collect assistant text for the audit row while passing bytes through.
      const text = decoder.decode(chunk, { stream: true });
      for (const line of text.split("\n")) {
        const delta = openAiSseDelta(line)?.content;
        if (delta) assistantContent += delta;
      }
      controller.enqueue(chunk);
    },
    flush() {
      void cleanup();
    },
  });

  return new Response(upstream.body.pipeThrough(passthroughStream), {
    headers: {
      "content-type":
        upstream.headers.get("content-type") ?? "text/event-stream",
      "cache-control": "no-cache, no-transform",
    },
  });
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204 });
}
