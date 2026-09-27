import { describe, it, expect, afterEach, vi } from "vitest";
import path from "node:path";
import fs from "node:fs";

const TMP = path.join(process.cwd(), "data", "test-chat-lock.db");

async function fresh() {
  fs.mkdirSync(path.dirname(TMP), { recursive: true });
  if (fs.existsSync(TMP)) fs.rmSync(TMP);
  process.env.APP_DB_PATH = TMP;
  const db = await import("@/lib/db");
  const users = await import("@/lib/users");
  const lock = await import("@/lib/chat-lock");
  return { db, users, lock };
}

afterEach(() => {
  if (fs.existsSync(TMP)) fs.rmSync(TMP);
  delete process.env.APP_DB_PATH;
  vi.unstubAllGlobals();
});

describe("distributed chat lock (chat_locks TTL row)", () => {
  it("acquires once, refuses a second concurrent acquire, releases", async () => {
    const { users, lock } = await fresh();
    const uid = await users.createUser("l1@example.com", "password123");
    expect(await lock.acquireChatLock(uid)).toBe(true);
    expect(await lock.acquireChatLock(uid)).toBe(false); // held
    await lock.releaseChatLock(uid);
    expect(await lock.acquireChatLock(uid)).toBe(true); // free again
  });

  it("takeover after TTL expiry (crashed holder)", async () => {
    const { db, users, lock } = await fresh();
    const uid = await users.createUser("l2@example.com", "password123");
    expect(await lock.acquireChatLock(uid)).toBe(true);
    // simulate a holder that crashed: backdate expires_at beyond the TTL
    await (await db.getDb()).run(
      "UPDATE chat_locks SET expires_at = ? WHERE user_id = ?",
      Date.now() - 1, uid,
    );
    expect(await lock.acquireChatLock(uid)).toBe(true);
  });

  it("renew extends the TTL and reports a lost lock", async () => {
    const { db, users, lock } = await fresh();
    const uid = await users.createUser("l3@example.com", "password123");
    expect(await lock.renewChatLock(uid)).toBe(false); // nothing held
    expect(await lock.acquireChatLock(uid)).toBe(true);
    const before = await (await db.getDb()).get<{ expires_at: number }>(
      "SELECT expires_at FROM chat_locks WHERE user_id = ?",
      uid,
    );
    // renew well after acquisition so the extension is observable
    vi.useFakeTimers();
    vi.setSystemTime((before?.expires_at ?? 0) - 10_000);
    expect(await lock.renewChatLock(uid)).toBe(true);
    const after = await (await db.getDb()).get<{ expires_at: number }>(
      "SELECT expires_at FROM chat_locks WHERE user_id = ?",
      uid,
    );
    expect(after!.expires_at).toBeGreaterThan(before!.expires_at);
    vi.useRealTimers();
    await lock.releaseChatLock(uid);
    expect(await lock.renewChatLock(uid)).toBe(false);
  });

  it("release is idempotent", async () => {
    const { users, lock } = await fresh();
    const uid = await users.createUser("l4@example.com", "password123");
    await lock.releaseChatLock(uid); // no row at all
    expect(await lock.acquireChatLock(uid)).toBe(true);
    await lock.releaseChatLock(uid);
    await lock.releaseChatLock(uid);
  });
});