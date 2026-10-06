import { z } from "zod";
import { requireUser, unauthorized } from "@/lib/route-session";
import { balanceSeconds } from "@/lib/credits";
import {
  ensureModelUp,
  modelChat,
  touchModelActivity,
  beginModelStream,
} from "@/lib/inference";
import {
  billedStreamGate,
  BilledStream,
  openAiSseDelta,
  persistAssistantMessage,
} from "@/lib/billed-stream";
import { getDb, newId } from "@/lib/db";
import { historyBudgets, trimHistory } from "@/lib/chat-history";
import { logger } from "@/lib/logger";
import { track } from "@/lib/telemetry";

const bodySchema = z.object({
  chatId: z.string().min(1).optional(),
  message: z.string().min(1).max(16000),
});

export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return unauthorized();
  const userId = user.id;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    track("chat.rejected", { "app.chat.reason": "invalid_request" });
    return Response.json({ error: "invalid request" }, { status: 400 });
  }
  const { chatId, message } = parsed.data;

  // One stream at a time per account (chat_locks TTL row — no parallel
  // double-burn of credits, across instances and after crashes) plus a
  // paid-credit gate; shared with /llama-ui (lib/billed-stream.ts).
  const gate = await billedStreamGate("chat", userId);
  if (gate instanceof Response) return gate;
  const balance = gate.balance;

  const db = await getDb();
  const chatRow = chatId
    ? await db.get<{ id: string }>(
        "SELECT id FROM chats WHERE id = ? AND user_id = ?",
        chatId,
        userId,
      )
    : undefined;
  const effectiveChatId = chatRow?.id ?? newId("chat");
  if (!chatRow) {
    await db.run(
      "INSERT INTO chats (id, user_id, title, created_at) VALUES (?,?,?,?)",
      effectiveChatId,
      userId,
      message.slice(0, 60),
      Date.now(),
    );
  }
  const userMsgId = newId("msg");
  await db.run(
    "INSERT INTO messages (id, chat_id, role, content, created_at) VALUES (?,?,?,?,?)",
    userMsgId,
    effectiveChatId,
    "user",
    message,
    Date.now(),
  );

  track("chat.request", {
    "app.user.id": userId,
    "app.chat.id": effectiveChatId,
    "app.chat.is_new": !chatRow,
    "app.chat.message_chars": message.length,
  });

  const allHistory = await db.all<{ role: string; content: string }>(
    "SELECT role, content FROM messages WHERE chat_id = ? ORDER BY created_at ASC",
    effectiveChatId,
  );
  // Bound the prompt: newest messages win (see lib/chat-history.ts) so long
  // chats cannot overflow the model context or bloat every request.
  const history = trimHistory(
    allHistory,
    historyBudgets().maxMessages,
    historyBudgets().maxChars,
  );

  const encoder = new TextEncoder();
  // Lifecycle (stop-loss abort, lock/lease heartbeat, metered debit, page-clock
  // resume, lock release) lives in lib/billed-stream.ts; this route supplies
  // the transcript persistence and SSE protocol via the finalize callback.
  const bs = new BilledStream({
    source: "chat",
    userId,
    chatId: effectiveChatId,
    balance,
    debitRef: `chat:${effectiveChatId}`,
  });
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      };
      const startedAt = Date.now();
      let assistantContent = "";
      let sentThinking = false; // one "thinking" status per reasoning burst

      const cleanup = async () => {
        await bs.cleanup(async (billed) => {
          await persistAssistantMessage(
            db,
            effectiveChatId,
            assistantContent,
            billed,
          );
          send("done", {
            billedSeconds: billed,
            chatId: effectiveChatId,
            balanceSeconds: await balanceSeconds(userId),
          });
          track("chat.completed", {
            "app.user.id": userId,
            "app.chat.id": effectiveChatId,
            "app.chat.billed_seconds": billed,
            "app.chat.response_chars": assistantContent.length,
            "app.chat.duration_ms": Date.now() - startedAt,
          });
        });
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      try {
        // Register the stream with the pod controller (idle-stop lease) for
        // the whole request, including warmup.
        beginModelStream(userId);

        // 1) Model warmup with live status events (pod start can take minutes).
        await ensureModelUp(
          (msg) => send("status", { status: msg }),
          bs.aborter.signal,
        );

        // 2) Stream from the active provider (OpenAI-compatible /v1/chat/completions).
        const upstreamRes = await modelChat(history, bs.aborter.signal);
        if (!upstreamRes.ok || !upstreamRes.body) {
          logger.error("model upstream error", {
            chatId: effectiveChatId,
            status: upstreamRes.status,
          });
          track("chat.failed", {
            "app.chat.id": effectiveChatId,
            "app.chat.upstream_status": upstreamRes.status,
          });
          send("error", {
            message: `model upstream error ${upstreamRes.status}`,
          });
          cleanup();
          return;
        }

        send("chat_meta", { chatId: effectiveChatId });

        // Billing starts here — warmup time is free for the user; the
        // page-open meter freezes (the stream meter owns these seconds).
        bs.startMetering();

        const reader = upstreamRes.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          touchModelActivity();
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            const delta = openAiSseDelta(line);
            if (!delta) continue;
            if (delta.content) {
              if (sentThinking) {
                sentThinking = false;
                send("status", { status: "ready" }); // clears the thinking status line
              }
              assistantContent += delta.content;
              send("token", { text: delta.content });
            } else if (delta.reasoning_content && !sentThinking) {
              // The new box (vast instance 54266365) serves Qwen3 with
              // enable_thinking + --reasoning-effort xhigh, so replies open
              // with (possibly minutes of) reasoning_content deltas before
              // the first content token. Show one status line so the wait
              // reads as activity; never persist reasoning into the message.
              sentThinking = true;
              send("status", { status: "model is thinking" });
            }
          }
        }
        cleanup();
      } catch (e) {
        send("error", { message: (e as Error).message });
        logger.error("chat stream failed", {
          chatId: effectiveChatId,
          error: (e as Error).message,
        });
        cleanup();
      }
    },
    cancel() {
      // client disconnected: abort upstream so the read loop (and billing) ends.
      bs.aborter.abort();
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
