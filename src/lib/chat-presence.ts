import { getDb } from "@/lib/db";
import { debit, balanceSeconds } from "@/lib/credits";

/**
 * Page-open ("parking meter") billing: while /chat is open, the client
 * heartbeats POST /api/chat-presence every ~10s. Each tick is server-
 * authoritative: the DB column users.open_billed_at is the billing clock —
 * never the client clock. Elapsed wall-clock seconds since the last tick are
 * debited via the guarded debit() (never negative, always ledgered).
 *
 * While a model stream runs for the user the clock is frozen (pauseStream) —
 * the stream meter owns those seconds — and resumeStream jumps the clock
 * forward to now after the stream's own debit, so no window is billed twice.
 *
 * Missing heartbeats (tab closed, sleep) bill at most CATCHUP_CAP_SECONDS on
 * the next tick; after ~30s of silence the presence is effectively expired
 * because the client stops heartbeating.
 */

/** Maximum elapsed seconds a single catch-up tick may bill. */
const CATCHUP_CAP_SECONDS = 60;

/** Users with an in-flight model stream; clock frozen for these. */
const activeStreams = new Set<string>();

export function pauseStream(userId: string): void {
  activeStreams.add(userId);
}

/** Resume the page-open clock at `now` after a stream finished debiting. */
export async function resumeStream(userId: string, now: number): Promise<void> {
  activeStreams.delete(userId);
  const db = await getDb();
  await db.run("UPDATE users SET open_billed_at = ? WHERE id = ?", now, userId);
}

export function streamActive(userId: string): boolean {
  return activeStreams.has(userId);
}

async function getOpenBilledAt(userId: string): Promise<number | null> {
  const row = await (await getDb()).get<{ open_billed_at: number | null }>(
    "SELECT open_billed_at FROM users WHERE id = ?",
    userId,
  );
  if (!row) throw new Error("user not found");
  return row.open_billed_at;
}

async function setOpenBilledAt(userId: string, at: number): Promise<void> {
  await (await getDb()).run("UPDATE users SET open_billed_at = ? WHERE id = ?", at, userId);
}

/**
 * One presence heartbeat. Seeds the clock on first call (no bill); otherwise
 * debits ceil(elapsed/1000)s capped at CATCHUP_CAP_SECONDS. Throws
 * "insufficient credits" without advancing the clock when the balance is
 * spent — the caller maps that to a 402 and the client redirects to the
 * portal.
 */
export async function openTick(userId: string, now: number): Promise<number> {
  const startedAt = await getOpenBilledAt(userId);
  if (startedAt === null) {
    await setOpenBilledAt(userId, now); // page just opened: seed, bill nothing
    return balanceSeconds(userId);
  }
  if (activeStreams.has(userId)) {
    // Stream meter owns the billing; hold the clock still (no debit).
    return balanceSeconds(userId);
  }
  const elapsed = Math.min(CATCHUP_CAP_SECONDS, Math.max(0, Math.ceil((now - startedAt) / 1000)));
  if (elapsed === 0) return balanceSeconds(userId);
  // Debit before advancing: on insufficient credits the clock stays put so
  // the unpaid window is not silently forgiven.
  await debit(userId, elapsed, "chat-open");
  await setOpenBilledAt(userId, now);
  return balanceSeconds(userId);
}