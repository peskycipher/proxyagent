import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import path from "node:path";
import fs from "node:fs";

const TMP = path.join(process.cwd(), "data", "test-billed-stream.db");

async function fresh() {
  vi.resetModules();
  fs.mkdirSync(path.dirname(TMP), { recursive: true });
  if (fs.existsSync(TMP)) fs.rmSync(TMP);
  process.env.APP_DB_PATH = TMP;
  const dbMod = await import("@/lib/db");
  const usersMod = await import("@/lib/users");
  const creditsMod = await import("@/lib/credits");
  const lockMod = await import("@/lib/chat-lock");
  const presenceMod = await import("@/lib/chat-presence");
  const mod = await import("@/lib/billed-stream");
  return { db: await dbMod.getDb(), ...usersMod, ...creditsMod, ...lockMod, ...presenceMod, ...mod };
}

afterEach(() => {
  vi.useRealTimers();
  if (fs.existsSync(TMP)) fs.rmSync(TMP);
  delete process.env.APP_DB_PATH;
  vi.resetModules();
});

beforeEach(() => {
  vi.resetModules();
});

describe("billedStreamGate", () => {
  const refused = (g: unknown): g is Response => g instanceof Response;
  it("refuses a second stream while the chat lock is held", async () => {
    const m = await fresh();
    const uid = await m.createUser("bs1@example.com", "password123");
    await m.acquireChatLock(uid); // other holder
    const res = await m.billedStreamGate("chat", uid);
    expect(res && refused(res) && res.status).toBe(429);
  });

  it("refuses an account with no credited seconds", async () => {
    const m = await fresh();
    const uid = await m.createUser("bs2@example.com", "password123");
    const res = await m.billedStreamGate("llamaproxy", uid);
    expect(res && refused(res) && res.status).toBe(402);
  });

  it("holds the lock and allows a funded account through", async () => {
    const m = await fresh();
    const uid = await m.createUser("bs3@example.com", "password123");
    await m.credit(uid, 100, "purchase:t");
    const g = await m.billedStreamGate("chat", uid);
    expect(!refused(g) && g.balance).toBe(100);
    expect(await m.acquireChatLock(uid)).toBe(false); // gate holds the lock
  });
});

describe("BilledStream cleanup", () => {
  it("bills metered time once, resumes the page clock, releases the lock", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    const m = await fresh();
    const uid = await m.createUser("bs4@example.com", "password123");
    await m.credit(uid, 100, "purchase:t");
    const bs = new m.BilledStream({ source: "chat", userId: uid, chatId: "chat_t", balance: 100, debitRef: "chat:t" });
    bs.startMetering();
    vi.advanceTimersByTime(10_000);
    const finalizes: number[] = [];
    await bs.cleanup((billed) => void finalizes.push(billed));
    expect(finalizes).toEqual([10]); // ceil(10s)
    expect(await m.balanceSeconds(uid)).toBe(90);
    const open = (await m.db.get<{ open_billed_at: number }>(
      "SELECT open_billed_at FROM users WHERE id = ?", uid))!;
    expect(open.open_billed_at).toBe(1_010_000); // page clock unfrozen at now()
    expect(await m.acquireChatLock(uid)).toBe(true); // lock released
    // idempotent: second cleanup neither bills nor finalizes
    await bs.cleanup((billed) => void finalizes.push(billed));
    expect(finalizes).toEqual([10]);
    expect(await m.balanceSeconds(uid)).toBe(90);
  });

  it("no meter → zero billing, teardown still releases the lock", async () => {
    const m = await fresh();
    const uid = await m.createUser("bs5@example.com", "password123");
    await m.credit(uid, 100, "purchase:t");
    await m.acquireChatLock(uid);
    const bs = new m.BilledStream({ source: "chat", userId: uid, chatId: "chat_t", balance: 100, debitRef: "chat:t" });
    let billedSeen: number[] = [];
    await bs.cleanup((billed) => void billedSeen.push(billed));
    expect(billedSeen).toEqual([0]);
    expect(await m.balanceSeconds(uid)).toBe(100);
    expect(await m.acquireChatLock(uid)).toBe(true);
  });

  it("stop-loss aborts when usage outlives the starting balance", async () => {
    vi.useFakeTimers();
    const m = await fresh();
    const uid = await m.createUser("bs6@example.com", "password123");
    const bs = new m.BilledStream({ source: "llamaproxy", userId: uid, chatId: "chat_t", balance: 3, debitRef: "llamaproxy:t" });
    expect(bs.aborter.signal.aborted).toBe(false);
    vi.advanceTimersByTime(3_000);
    expect(bs.aborter.signal.aborted).toBe(true);
  });
});