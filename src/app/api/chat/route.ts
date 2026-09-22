import { z } from "zod";
import { auth } from "@/auth";
import { balanceSeconds, debit } from "@/lib/credits";
import { ensurePodUp, touchPodActivity } from "@/lib/pod";
import { Meter } from "@/lib/meter";
import { getDb, newId } from "@/lib/db";

const bodySchema = z.object({
  chatId: z.string().min(1).optional(),
  message: z.string().min(1).max(16000),
});

/** Per-user in-flight lock: prevents parallel double-burn of credits. */
const inFlight = new Set<string>();

const LLAMA_BASE = () => (process.env.LLAMA_SERVER_URL || "").replace(/\/$/, "");

function llamaHeaders(): Record<string, string> {
  return { "content-type": "application/json", ...(process.env.LLAMA_API_KEY ? { Authorization: `Bearer ${process.env.LLAMA_API_KEY}` } : {}) };
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "unauthorized" }, { status: 401 });
  const userId = session.user.id;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid request" }, { status: 400 });
  const { chatId, message } = parsed.data;

  if (inFlight.has(userId)) {
    return Response.json({ error: "another request is already streaming for this account" }, { status: 429 });
  }

  if (balanceSeconds(userId) < 1) {
    return Response.json({ error: "insufficient credits — buy more time in the portal" }, { status: 402 });
  }

  const db = getDb();
  const chatRow = chatId
    ? (db.prepare("SELECT id FROM chats WHERE id = ? AND user_id = ?").get(chatId, userId) as { id: string } | undefined)
    : undefined;
  const effectiveChatId = chatRow?.id ?? newId("chat");
  if (!chatRow) {
    db.prepare("INSERT INTO chats (id, user_id, title, created_at) VALUES (?,?,?,?)").run(
      effectiveChatId, userId, message.slice(0, 60), Date.now(),
    );
  }
  const userMsgId = newId("msg");
  db.prepare("INSERT INTO messages (id, chat_id, role, content, created_at) VALUES (?,?,?,?,?)").run(
    userMsgId, effectiveChatId, "user", message, Date.now(),
  );

  const history = db
    .prepare("SELECT role, content FROM messages WHERE chat_id = ? ORDER BY created_at ASC")
    .all(effectiveChatId) as Array<{ role: string; content: string }>;

  inFlight.add(userId);
  const encoder = new TextEncoder();
  const aborter = new AbortController();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };
      let meter: Meter | null = null; // starts only when the model request begins
      let assistantContent = "";
      let billed = 0;
      let cleanedUp = false;

      const cleanup = () => {
        if (cleanedUp) return;
        cleanedUp = true;
        try {
          if (meter) billed = meter.stop();
          if (billed > 0) {
            debit(userId, billed, `chat:${effectiveChatId}`);
          }
          if (assistantContent) {
            db.prepare("INSERT INTO messages (id, chat_id, role, content, billed_seconds, created_at) VALUES (?,?,?,?,?,?)").run(
              newId("msg"), effectiveChatId, "assistant", assistantContent, billed, Date.now(),
            );
          }
          send("done", { billedSeconds: billed, chatId: effectiveChatId, balanceSeconds: balanceSeconds(userId) });
        } catch (e) {
          // debit failure: log loudly, but the stream is already over
          console.error("chat cleanup error", (e as Error).message);
        }
        inFlight.delete(userId);
        try { controller.close(); } catch { /* already closed */ }
      };

      try {
        // 1) Pod warmup with live status events (pod start can take minutes).
        await ensurePodUp((msg) => send("status", { status: msg }));

        // 2) Stream from llama-server (OpenAI-compatible /v1/chat/completions).
        const upstreamRes = await fetch(`${LLAMA_BASE()}/v1/chat/completions`, {
          method: "POST",
          headers: llamaHeaders(),
          body: JSON.stringify({ stream: true, messages: history }),
          signal: aborter.signal,
        });
        if (!upstreamRes.ok || !upstreamRes.body) {
          const detail = await upstreamRes.text().catch(() => "");
          send("error", { message: `model upstream error ${upstreamRes.status}` });
          cleanup();
          return;
        }

        send("chat_meta", { chatId: effectiveChatId });

        // Billing starts here — warmup time is free for the user.
        meter = new Meter();

        const reader = upstreamRes.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          touchPodActivity();
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const payload = line.slice(6).trim();
            if (payload === "[DONE]") continue;
            try {
              const json = JSON.parse(payload) as { choices?: Array<{ delta?: { content?: string } }> };
              const delta = json.choices?.[0]?.delta?.content;
              if (delta) {
                assistantContent += delta;
                send("token", { text: delta });
              }
            } catch {
              // ignore malformed chunks
            }
          }
        }
        cleanup();
      } catch (e) {
        send("error", { message: (e as Error).message });
        cleanup();
      }
    },
    cancel() {
      // client disconnected: abort upstream so the read loop (and billing) ends.
      aborter.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}