import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "node:path";
import fs from "node:fs";

const TMP = path.join(process.cwd(), "data", "test-credits.db");

// Rebuild a fresh module instance per test with a temp DB.
async function fresh() {
  fs.mkdirSync(path.dirname(TMP), { recursive: true });
  if (fs.existsSync(TMP)) fs.rmSync(TMP);
  process.env.APP_DB_PATH = TMP;
  const dbMod = await import("@/lib/db");
  const creditsMod = await import("@/lib/credits");
  const usersMod = await import("@/lib/users");
  return { db: dbMod.getDb(), ...creditsMod, ...usersMod };
}

afterEach(() => {
  if (fs.existsSync(TMP)) fs.rmSync(TMP);
  delete process.env.APP_DB_PATH;
  // bust module cache so next import re-reads env
  delete (globalThis as Record<string, unknown>).__creditsTestBust;
  void import.meta; // noop
});

// vitest caches module graph per file; use dynamic import with vi.resetModules
import { vi } from "vitest";

describe("credits", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("credits and debits with an audit ledger, balance = sum(delta)", async () => {
    const m = await fresh();
    const uid = m.createUser("a@example.com", "password123");
    m.credit(uid, 3600, "purchase:test-1");
    m.credit(uid, 60, "purchase:test-2");
    expect(m.balanceSeconds(uid)).toBe(3660);

    m.debit(uid, 90, "chat:msg-1");
    expect(m.balanceSeconds(uid)).toBe(3570);

    const txns = m.txnsFor(uid);
    expect(txns.map((t) => t.delta_seconds)).toEqual([3600, 60, -90]);
  });

  it("refuses to debit below zero", async () => {
    const m = await fresh();
    const uid = m.createUser("b@example.com", "password123");
    m.credit(uid, 10, "purchase:t");
    expect(() => m.debit(uid, 11, "chat:m")).toThrow(/insufficient/i);
    expect(m.balanceSeconds(uid)).toBe(10);
  });

  it("debit from zero balance throws", async () => {
    const m = await fresh();
    const uid = m.createUser("c@example.com", "password123");
    expect(() => m.debit(uid, 1, "chat:m")).toThrow(/insufficient/i);
  });

  it("concurrent debits never drive balance negative", async () => {
    const m = await fresh();
    const uid = m.createUser("d@example.com", "password123");
    m.credit(uid, 100, "purchase:t");
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, (_, i) => Promise.resolve().then(() => m.debit(uid, 30, `chat:m${i}`))),
    );
    const fulfilled = results.filter((r) => r.status === "fulfilled").length;
    expect(fulfilled).toBe(3); // only 3 x 30s fit in 100s
    expect(m.balanceSeconds(uid)).toBe(10);
  });
});