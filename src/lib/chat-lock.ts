import { getDb } from "@/lib/db";

/**
 * Distributed per-user chat lock — one in-flight stream per account, across
 * instances (replaces the old per-isolate in-memory Set).
 *
 * The lock is a TTL row in the `chat_locks` table:
 * - Acquire is a single upsert that only succeeds when the row is absent or
 *   expired — SQLite serializes writes, so concurrent acquires resolve to one
 *   winner, and a crashed holder's lock is automatically taken over after the
 *   TTL (no cleanup process needed).
 * - A live stream renews the TTL on a heartbeat well inside the TTL, so a
 *   minutes-long stream never expires while it is actually running.
 */

const CHAT_LOCK_TTL_MS = 90_000;
export const CHAT_LOCK_RENEW_INTERVAL_MS = 30_000;

/** Try to take the chat lock. False means another stream holds it (or held it recently). */
export async function acquireChatLock(userId: string): Promise<boolean> {
  const db = await getDb();
  const now = Date.now();
  const res = await db.run(
    `INSERT INTO chat_locks (user_id, expires_at) VALUES (?, ?)
     ON CONFLICT(user_id) DO UPDATE SET expires_at = excluded.expires_at
     WHERE chat_locks.expires_at <= ?`,
    userId, now + CHAT_LOCK_TTL_MS, now,
  );
  return res.changes > 0;
}

/**
 * Extend the lock (heartbeat). False means we no longer hold it — the row was
 * expired and taken over, or released.
 */
export async function renewChatLock(userId: string): Promise<boolean> {
  const db = await getDb();
  const res = await db.run(
    "UPDATE chat_locks SET expires_at = ? WHERE user_id = ?",
    Date.now() + CHAT_LOCK_TTL_MS, userId,
  );
  return res.changes > 0;
}

/** Release the lock. Idempotent. */
export async function releaseChatLock(userId: string): Promise<void> {
  const db = await getDb();
  await db.run("DELETE FROM chat_locks WHERE user_id = ?", userId);
}