/**
 * Shared billing-stream lifecycle for /api/chat and the /llama-ui completion
 * proxy: per-account chat lock, balance gate, stop-loss abort capped at the
 * pre-stream balance, lock/lease heartbeat, and the once-guarded teardown —
 * meter, debit of real usage, unfreeze the page-open clock, route finalize,
 * release both locks. Route-specific parts (transcript persistence, SSE
 * events, stream parsing) stay in the routes; this module owns the lifecycle
 * so billing/lock semantics change in exactly one place.
 */
import { Meter } from "@/lib/meter";
import { pauseStream, resumeStream } from "@/lib/chat-presence";
import {
  acquireChatLock,
  releaseChatLock,
  renewChatLock,
  CHAT_LOCK_RENEW_INTERVAL_MS,
} from "@/lib/chat-lock";
import { beginModelStream, endModelStream, renewModelStream } from "@/lib/inference";
import { balanceSeconds, debit } from "@/lib/credits";
import { logger } from "@/lib/logger";
import { track } from "@/lib/telemetry";

export type BilledSource = "chat" | "llamaproxy";

const REJECT_REASON_KEY: Record<BilledSource, string> = {
  chat: "app.chat.reason",
  llamaproxy: "app.reason",
};

/**
 * Request prelude both billing routes share: one stream per account (TTL
 * lock), and at least one credited second. Returns the refusal response to
 * send, or the account balance when the caller may proceed (lock held).
 */
export async function billedStreamGate(
  source: BilledSource,
  userId: string,
): Promise<Response | { balance: number }> {
  if (!(await acquireChatLock(userId))) {
    track(`${source}.rejected`, { "app.user.id": userId, [REJECT_REASON_KEY[source]]: "already_streaming" });
    return Response.json({ error: "another request is already streaming for this account" }, { status: 429 });
  }
  const balance = await balanceSeconds(userId);
  if (balance < 1) {
    track(`${source}.rejected`, { "app.user.id": userId, [REJECT_REASON_KEY[source]]: "insufficient_credits" });
    return Response.json({ error: "insufficient credits — buy more time in the portal" }, { status: 402 });
  }
  return { balance };
}

export interface BilledStreamOpts {
  source: BilledSource;
  userId: string;
  chatId: string;
  /** Account balance when the model request began — caps stop-loss. */
  balance: number;
  /** Ledger reference, e.g. "chat:<id>" or "llamaproxy:<id>". */
  debitRef: string;
}

/**
 * Owns the aborter, stop-loss timer, and lock heartbeat for one billed
 * stream; `cleanup()` runs the teardown exactly once (idempotent).
 *
 * Stop-loss: a stream may never bill more than the balance the account held
 * when the model request began. The abort ends the upstream read; cleanup
 * then bills actual usage — the user is charged only for real model time,
 * capped at their balance (never overdrawn, never overcharged). Only
 * balance-growing operations (purchase confirms) can change the balance
 * during a stream: billing streams are one-per-account via the chat lock.
 */
export class BilledStream {
  readonly aborter = new AbortController();
  /** null until billing starts — warmup time is free for the user. */
  private meter: Meter | null = null;
  private readonly stopLoss: ReturnType<typeof setTimeout>;
  private readonly heartbeat: ReturnType<typeof setInterval>;
  private cleanedUp = false;

  constructor(private p: BilledStreamOpts) {
    this.stopLoss = setTimeout(() => this.aborter.abort(), Math.max(1, p.balance) * 1000);
    // Keep both locks alive while the stream runs — the chat lock TTL and the
    // pod-controller stream lease (runpod only) — renewing well inside both
    // TTLs so a minutes-long stream never expires mid-flight.
    this.heartbeat = setInterval(() => {
      renewChatLock(p.userId)
        .then((held) => {
          if (!held) logger.error(`${p.source} lock lost mid-stream`, { userId: p.userId });
        })
        .catch((e) => logger.error(`${p.source} lock renew failed`, { userId: p.userId, error: (e as Error).message }));
      renewModelStream(p.userId);
    }, CHAT_LOCK_RENEW_INTERVAL_MS);
  }

  /** Meter starts when the upstream stream opens; the page-open meter freezes. */
  startMetering(): void {
    if (this.meter) return;
    this.meter = new Meter();
    pauseStream(this.p.userId);
  }

  /**
   * Idempotent teardown: stop the meter, debit actual usage, unfreeze the
   * page clock, run `finalize` (transcript persistence / final SSE events),
   * then release both locks. The lock is released even when billing failed —
   * a stuck lock would block this user's next message until the TTL lapses.
   * `beginModelStream` must have been called upstream (lease covers warmup).
   */
  async cleanup(finalize?: (billed: number) => void | Promise<void>): Promise<void> {
    if (this.cleanedUp) return;
    this.cleanedUp = true;
    clearTimeout(this.stopLoss);
    let billed = 0;
    try {
      billed = this.meter?.stop() ?? 0;
      if (billed > 0) await debit(this.p.userId, billed, this.p.debitRef);
      // Unfreeze the page-open clock at now() — stream time was billed by the
      // stream meter above, so no window is charged twice.
      await resumeStream(this.p.userId, Date.now());
      await finalize?.(billed);
    } catch (e) {
      // debit failure: log loudly, but the stream is already over
      logger.error(`${this.p.source} cleanup error`, { chatId: this.p.chatId, error: (e as Error).message });
      track(`${this.p.source}.failed`, { "app.chat.id": this.p.chatId, "app.chat.error": "cleanup_error" });
    }
    clearInterval(this.heartbeat);
    endModelStream(this.p.userId);
    try {
      await releaseChatLock(this.p.userId);
    } catch (e) {
      logger.error(`${this.p.source} lock release failed`, { userId: this.p.userId, error: (e as Error).message });
    }
  }
}