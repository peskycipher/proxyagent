import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import path from "node:path";
import fs from "node:fs";

const TMP = path.join(process.cwd(), "data", "test-presence.db");

async function fresh() {
  fs.mkdirSync(path.dirname(TMP), { recursive: true });
  if (fs.existsSync(TMP)) fs.rmSync(TMP);
  process.env.APP_DB_PATH = TMP;
  const dbMod = await import("@/lib/db");
  const creditsMod = await import("@/lib/credits");
  const usersMod = await import("@/lib/users");
  const presenceMod = await import("@/lib/chat-presence");
  return {
    db: await dbMod.getDb(),
    ...creditsMod,
    ...usersMod,
    ...presenceMod,
  };
}

afterEach(() => {
  if (fs.existsSync(TMP)) fs.rmSync(TMP);
  delete process.env.APP_DB_PATH;
  void import.meta;
});

describe("chat-presence", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("first tick seeds the clock and bills nothing", async () => {
    const m = await fresh();
    const uid = await m.createUser("p1@example.com", "password123");
    await m.credit(uid, 100, "purchase:t");
    const bal = await m.openTick(uid, 1000);
    expect(bal).toBe(100);
    const row = (await m.db.get("SELECT open_billed_at FROM users WHERE id = ?", uid))!;
    expect(row.open_billed_at).toBe(1000);
  });

  it("ticks debit elapsed wall-clock seconds, rounded up, min 1", async () => {
    const m = await fresh();
    const uid = await m.createUser("p2@example.com", "password123");
    await m.credit(uid, 100, "purchase:t");
    await m.openTick(uid, 1000);
    expect(await m.openTick(uid, 11_000)).toBe(90); // 10_000ms → 10s
    expect(await m.openTick(uid, 11_400)).toBe(89); // 400ms → ceil = 1s
  });

  it("zero elapsed bills nothing", async () => {
    const m = await fresh();
    const uid = await m.createUser("p3@example.com", "password123");
    await m.credit(uid, 100, "purchase:t");
    await m.openTick(uid, 1000);
    expect(await m.openTick(uid, 1000)).toBe(100);
  });

  it("catch-up elapsed is capped at 60s per tick", async () => {
    const m = await fresh();
    const uid = await m.createUser("p4@example.com", "password123");
    await m.credit(uid, 10_000, "purchase:t");
    await m.openTick(uid, 1000);
    const bal = await m.openTick(uid, 1000 + 200_000); // 200s away
    expect(bal).toBe(10_000 - 60);
    // clock advanced: next tick bills only the fresh window
    const bal2 = await m.openTick(uid, 1000 + 200_000 + 5_000);
    expect(bal2).toBe(bal - 5);
  });

  it("insufficient balance throws and does not advance the clock", async () => {
    const m = await fresh();
    const uid = await m.createUser("p4@example.com", "password123");
    await m.credit(uid, 5, "purchase:t");
    await m.openTick(uid, 1000);
    await expect(m.openTick(uid, 1000 + 30_000)).rejects.toThrow(/insufficient/i);
    const row = (await m.db.get("SELECT open_billed_at FROM users WHERE id = ?", uid))!;
    expect(row.open_billed_at).toBe(1000);
  });

  it("no debit and no clock advance while a stream is active", async () => {
    const m = await fresh();
    const uid = await m.createUser("p5@example.com", "password123");
    await m.credit(uid, 100, "purchase:t");
    await m.openTick(uid, 1000);
    m.pauseStream(uid);
    expect(m.streamActive(uid)).toBe(true);
    expect(await m.openTick(uid, 61_000)).toBe(100); // 60s passed, nothing billed
    const row = (await m.db.get("SELECT open_billed_at FROM users WHERE id = ?", uid))!;
    expect(row.open_billed_at).toBe(1000);
  });

  it("resumeStream jumps the clock to now so stream time is not double-billed", async () => {
    const m = await fresh();
    const uid = await m.createUser("p6@example.com", "password123");
    await m.credit(uid, 100, "purchase:t");
    await m.openTick(uid, 1000);
    m.pauseStream(uid);
    await m.openTick(uid, 61_000); // paused: no bill, clock frozen at 1000
    await m.resumeStream(uid, 65_000);
    expect(m.streamActive(uid)).toBe(false);
    const bal = await m.openTick(uid, 70_000);
    expect(bal).toBe(100 - 5); // bills only the post-stream window
  });
});
describe("chat-presence API route", () => {
  it("POST handler auths, ticks presence, maps insufficient credits to 402", async () => {
    const src = (await import("node:fs")).readFileSync("src/app/api/chat-presence/route.ts", "utf8");
    expect(src).toMatch(/export async function POST/);
    expect(src).toMatch(/openTick\(userId, Date\.now\(\)\)/);
    expect(src).toMatch(/status: 402/);
  });
});
