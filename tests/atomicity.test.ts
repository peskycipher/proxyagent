import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import path from "node:path";
import fs from "node:fs";

// Fault injection: the mocked getDb wraps the real driver and throws when a
// statement/batch matches inj.failOn. Used to prove that multi-statement
// money movements are atomic — a mid-sequence crash must leave no partial
// state (balance moved without ledger row, or purchase confirmed uncredited).
const inj = vi.hoisted(() => ({ failOn: null as string | null }));

type DbStmt = { sql: string; params?: unknown[] };

vi.mock("@/lib/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db")>();
  const realGetDb = actual.getDb;
  return {
    ...actual,
    getDb: async () => {
      const db = await realGetDb();
      return {
        get: db.get.bind(db),
        all: db.all.bind(db),
        run: async (sql: string, ...params: unknown[]) => {
          if (inj.failOn && sql.includes(inj.failOn)) throw new Error(`injected failure: ${sql}`);
          return db.run(sql, ...params);
        },
        batch: async (stmts: DbStmt[]) => {
          const failOn = inj.failOn;
          if (failOn && stmts.some((s: DbStmt) => s.sql.includes(failOn))) {
            throw new Error(`injected batch failure: ${failOn}`);
          }
          return db.batch(stmts);
        },
      };
    },
  };
});

const TMP = path.join(process.cwd(), "data", "test-atomic.db");

async function fresh() {
  fs.mkdirSync(path.dirname(TMP), { recursive: true });
  if (fs.existsSync(TMP)) fs.rmSync(TMP);
  process.env.APP_DB_PATH = TMP;
  const dbMod = await import("@/lib/db");
  const usersMod = await import("@/lib/users");
  const creditsMod = await import("@/lib/credits");
  const purchasesMod = await import("@/lib/purchases");
  return { db: await dbMod.getDb(), ...usersMod, ...creditsMod, ...purchasesMod };
}

beforeEach(() => {
  vi.resetModules();
  inj.failOn = null;
});

afterEach(() => {
  if (fs.existsSync(TMP)) fs.rmSync(TMP);
  delete process.env.APP_DB_PATH;
});

describe("db atomicity under fault injection", () => {
  it("driver batch rolls back earlier statements when a later one fails", async () => {
    const m = await fresh();
    const uid = await m.createUser("x@example.com", "password123");
    await expect(
      m.db.batch([
        { sql: "UPDATE users SET balance_seconds = balance_seconds + 3600 WHERE id = ?", params: [uid] },
        { sql: "INSERT INTO nonexistent_table (a) VALUES (1)" },
      ]),
    ).rejects.toThrow();
    expect(await m.balanceSeconds(uid)).toBe(0); // nothing applied
  });

  it("debit is atomic: ledger-insert failure leaves balance and ledger untouched", async () => {
    const m = await fresh();
    const uid = await m.createUser("d1@example.com", "password123");
    await m.credit(uid, 3600, "purchase:t");
    inj.failOn = "INSERT INTO credit_txns";
    await expect(m.debit(uid, 600, "chat:m")).rejects.toThrow(/injected/i);
    inj.failOn = null;
    expect(await m.balanceSeconds(uid)).toBe(3600); // pre-fix bug: 3000
    expect((await m.txnsFor(uid)).length).toBe(1); // only the credit row
    // and it still works once the fault clears
    await m.debit(uid, 600, "chat:m");
    expect(await m.balanceSeconds(uid)).toBe(3000);
    expect((await m.txnsFor(uid)).map((t) => t.delta_seconds)).toEqual([3600, -600]);
  });

  it("debit never writes a ledger row for a refused (insufficient) debit", async () => {
    const m = await fresh();
    const uid = await m.createUser("d2@example.com", "password123");
    await m.credit(uid, 10, "purchase:t");
    await expect(m.debit(uid, 11, "chat:m")).rejects.toThrow(/insufficient/i);
    expect((await m.txnsFor(uid)).length).toBe(1); // credit row only
    expect(await m.balanceSeconds(uid)).toBe(10);
  });

  it("confirmPurchase is atomic: credit failure leaves purchase pending and retry credits exactly once", async () => {
    const m = await fresh();
    const uid = await m.createUser("d3@example.com", "password123");
    const p = await m.createPurchase(uid, 1, "btc");
    inj.failOn = "INSERT INTO credit_txns";
    await expect(m.confirmPurchase(p.id, "uuid-1", 106)).rejects.toThrow(/injected/i);
    inj.failOn = null;
    expect((await m.getPurchase(p.id))!.status).toBe("pending"); // pre-fix bug: "confirmed"
    expect(await m.balanceSeconds(uid)).toBe(0);
    const retry = await m.confirmPurchase(p.id, "uuid-2", 106);
    expect(retry!.credited).toBe(true);
    expect(await m.balanceSeconds(uid)).toBe(3600);
    expect((await m.txnsFor(uid)).length).toBe(1); // credited exactly once
  });
});
