import { z } from "zod";
import { requireUser, unauthorized } from "@/lib/route-session";
import { balanceSeconds, debit } from "@/lib/credits";
import {
  ensureModelUp,
  modelChat,
  touchModelActivity,
  beginModelStream,
  renewModelStream,
  endModelStream,
} from "@/lib/inference";
import { Meter } from "@/lib/meter";
import { pauseStream, resumeStream } from "@/lib/chat-presence";
import { getDb, newId } from "@/lib/db";
import {
  acquireChatLock,
  releaseChatLock,
  renewChatLock,
  CHAT_LOCK_RENEW_INTERVAL_MS,
} from "@/lib/chat-lock";
import { historyBudgets, trimHistory } from "@/lib/chat-history";
import { logger } from "@/lib/logger";

const bodySchema = z.object({
  chatId: z.string().min(1).optional(),
  message: z.string().min(1).max(16000),
});

export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return unauthorized();
  const userId = user.id;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid request" }, { status: 400 });
  const { chatId, message } = parsed.data;

  // Distributed per-user lock (chat_locks TTL row): prevents parallel
  // double-burn of credits, across instances and after crashes (stale locks
  // expire via TTL). One stream at a time per account.
  if (!(await acquireChatLock(userId))) {
    return Response.json({ error: "another request is already streaming for this account" }, { status: 429 });
  }

  const balance = await balanceSeconds(userId);
  if (balance < 1) {
    return Response.json({ error: "insufficient credits — buy more time in the portal" }, { status: 402 });
  }

  const db = await getDb();
  const chatRow = chatId
    ? (await db.get<{ id: string }>("SELECT id FROM chats WHERE id = ? AND user_id = ?", chatId, userId))
    : undefined;
  const effectiveChatId = chatRow?.id ?? newId("chat");
  if (!chatRow) {
    await db.run(
      "INSERT INTO chats (id, user_id, title, created_at) VALUES (?,?,?,?)",
      effectiveChatId, userId, message.slice(0, 60), Date.now(),
    );
  }
  const userMsgId = newId("msg");
  await db.run("INSERT INTO messages (id, chat_id, role, content, created_at) VALUES (?,?,?,?,?)", userMsgId, effectiveChatId, "user", message, Date.now());

  const allHistory = await db
    .all<{ role: string; content: string }>("SELECT role, content FROM messages WHERE chat_id = ? ORDER BY created_at ASC", effectiveChatId);
  // Bound the prompt: newest messages win (see lib/chat-history.ts) so long
  // chats cannot overflow the model context or bloat every request.
  const history = trimHistory(allHistory, historyBudgets().maxMessages, historyBudgets().maxChars);

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
      // Stop-loss: a stream may never bill more than the balance the account
      // held when the model request began. The abort ends the upstream read;
      // cleanup then bills actual usage — the user is charged only for real
      // model time, capped at their balance (never overdrawn, never
      // overcharged). Only balance-growing operations (purchase confirms) can
      // change the balance during a stream: chat is one-stream-per-account.
      const stopLoss = setTimeout(() => aborter.abort(), Math.max(1, balance) * 1000);

      // Keep the chat lock alive while the stream runs (renew well inside the
      // TTL so a minutes-long stream never expires mid-flight).
      const heartbeat = setInterval(() => {
        renewChatLock(userId)
          .then((held) => {
            if (!held) logger.error("chat lock lost mid-stream", { userId });
          })
          .catch((e) => logger.error("chat lock renew failed", { userId, error: (e as Error).message }));
        renewModelStream(userId); // keep the pod-controller stream lease alive (runpod only)
      }, CHAT_LOCK_RENEW_INTERVAL_MS);

      const cleanup = async () => {
        if (cleanedUp) return;
        cleanedUp = true;
        clearTimeout(stopLoss);
        try {
          if (meter) billed = meter.stop();
          if (billed > 0) {
            await debit(userId, billed, `chat:${effectiveChatId}`);
          }
          // Unfreeze the page-open clock at now() — stream time was billed by
          // the stream meter above, so no window is charged twice.
          await resumeStream(userId, Date.now());
          if (assistantContent) {
            await db.run(
              "INSERT INTO messages (id, chat_id, role, content, billed_seconds, created_at) VALUES (?,?,?,?,?,?)",
              newId("msg"), effectiveChatId, "assistant", assistantContent, billed, Date.now(),
            );
          }
          send("done", { billedSeconds: billed, chatId: effectiveChatId, balanceSeconds: await balanceSeconds(userId) });
        } catch (e) {
          // debit failure: log loudly, but the stream is already over
          logger.error("chat cleanup error", { chatId: effectiveChatId, error: (e as Error).message });
        }
        // Release the lock even when billing failed above — a stuck lock would
        // block this user's next message until the TTL lapses.
        clearInterval(heartbeat);
        endModelStream(userId);
        try {
          await releaseChatLock(userId);
        } catch (e) {
          logger.error("chat lock release failed", { userId, error: (e as Error).message });
        }
        try { controller.close(); } catch { /* already closed */ }
      };

      try {
        // Register the stream with the pod controller (idle-stop lease) for
        // the whole request, including warmup.
        beginModelStream(userId);

        // 1) Model warmup with live status events (pod start can take minutes).
        await ensureModelUp((msg) => send("status", { status: msg }), aborter.signal);

        // 2) Stream from the active provider (OpenAI-compatible /v1/chat/completions).
        const upstreamRes = await modelChat(history, aborter.signal);
        if (!upstreamRes.ok || !upstreamRes.body) {
          logger.error("model upstream error", { chatId: effectiveChatId, status: upstreamRes.status });
          send("error", { message: `model upstream error ${upstreamRes.status}` });
          cleanup();
          return;
        }

        send("chat_meta", { chatId: effectiveChatId });

        // Billing starts here — warmup time is free for the user.
        meter = new Meter();
        // Freeze the page-open meter: the stream meter owns these seconds.
        pauseStream(userId);

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
        logger.error("chat stream failed", { chatId: effectiveChatId, error: (e as Error).message });
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
