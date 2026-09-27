import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import path from "node:path";
import fs from "node:fs";

const TMP = path.join(process.cwd(), "data", "test-reconcile.db");

async function fresh() {
  fs.mkdirSync(path.dirname(TMP), { recursive: true });
  if (fs.existsSync(TMP)) fs.rmSync(TMP);
  process.env.APP_DB_PATH = TMP;
  process.env.BASE_URL = "https://site.example";
  process.env.GATEWAY_WEBHOOK_SECRET = "s3cret";
  const db = await import("@/lib/db");
  const users = await import("@/lib/users");
  const purchases = await import("@/lib/purchases");
  const credits = await import("@/lib/credits");
  const reconcile = await import("@/lib/reconcile");
  return { db, users, purchases, credits, reconcile };
}

afterEach(() => {
  if (fs.existsSync(TMP)) fs.rmSync(TMP);
  delete process.env.APP_DB_PATH;
  delete process.env.BASE_URL;
  delete process.env.GATEWAY_WEBHOOK_SECRET;
  vi.unstubAllGlobals();
});

async function seedPurchase(hours = 12) {
  const m = await fresh();
  const uid = await m.users.createUser("r@example.com", "password123");
  const p = await m.purchases.createPurchase(uid, hours, "btc", "nonce-abc");
  await m.purchases.attachCharge(p.id, "bc1qaddr");
  return { m, uid, p };
}

describe("webhook-loss reconciliation via CryptAPI logs", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("skips fresh, non-pending, and charge-less purchases", async () => {
    const { m, p } = await seedPurchase();
    // fresh: below RECONCILE_AFTER_MS
    expect(await m.reconcile.reconcilePurchase(p.id)).toBe("skipped");
    // non-pending
    await (await m.db.getDb()).run("UPDATE purchases SET status = 'confirmed' WHERE id = ?", p.id);
    await (await m.db.getDb()).run("UPDATE purchases SET created_at = ? WHERE id = ?", Date.now() - 120000, p.id);
    expect(await m.reconcile.reconcilePurchase(p.id)).toBe("skipped");
  });

  it("confirms a lost-webhook payment from the logs endpoint", async () => {
    const { m, uid, p } = await seedPurchase();
    await (await m.db.getDb()).run("UPDATE purchases SET created_at = ? WHERE id = ?", Date.now() - 120000, p.id);

    const loggedCallbackUrl = encodeURIComponent(
      `https://site.example/api/webhooks/gateway/s3cret?invoice=${p.id}&nonce=nonce-abc`,
    );
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          status: "success",
          callbacks: [
            {
              txid_in: "tx1",
              result: "sent",
              value_coin: 0.1,
              logs: [
                {
                  request_url:
                    "https://site.example/api/webhooks/gateway/s3cret?invoice=" +
                    p.id +
                    "&nonce=nonce-abc&uuid=uuid-logs&pending=0" +
                    '&value_coin_convert={"USD": "19.08"}',
                },
              ],
            },
          ],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    expect(await m.reconcile.reconcilePurchase(p.id)).toBe("confirmed");
    // fetched the logs endpoint with the reconstructed callback URL
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain(`/btc/logs/?callback=${loggedCallbackUrl}`);
    // credited exactly once with the stored uuid as gateway_ref
    expect(await m.credits.balanceSeconds(uid)).toBe(43200);
    const stored = await m.purchases.getPurchase(p.id);
    expect(stored!.status).toBe("confirmed");
    expect(stored!.gateway_ref).toBe("uuid-logs");
    // idempotent: a second pass does nothing
    expect(await m.reconcile.reconcilePurchase(p.id)).toBe("skipped");
  });

  it("marks underpaid when the logged gross value is below the price", async () => {
    const { m, uid, p } = await seedPurchase();
    await (await m.db.getDb()).run("UPDATE purchases SET created_at = ? WHERE id = ?", Date.now() - 120000, p.id);
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          status: "success",
          callbacks: [
            {
              txid_in: "tx1",
              result: "sent",
              value_coin: 0.001,
              logs: [
                {
                  request_url:
                    "https://site.example/cb?invoice=" + p.id + "&uuid=uuid-low&pending=0" +
                    '&value_coin_convert={"USD": "5.00"}',
                },
              ],
            },
          ],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    expect(await m.reconcile.reconcilePurchase(p.id)).toBe("underpaid");
    expect(await m.credits.balanceSeconds(uid)).toBe(0);
    expect((await m.purchases.getPurchase(p.id))!.status).toBe("underpaid");
  });

  it("expires stale purchases with no deposit in the logs", async () => {
    const { m, p } = await seedPurchase();
    // 73h old, no callbacks at all
    await (await m.db.getDb()).run(
      "UPDATE purchases SET created_at = ? WHERE id = ?",
      Date.now() - 73 * 3600_000,
      p.id,
    );
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        new Response(JSON.stringify({ status: "success", callbacks: [] }), { status: 200 }),
      ),
    );
    expect(await m.reconcile.reconcilePurchase(p.id)).toBe("expired");
    expect((await m.purchases.getPurchase(p.id))!.status).toBe("expired");
  });

  it("leaves purchases pending when a deposit is seen but unconfirmed", async () => {
    const { m, p } = await seedPurchase();
    await (await m.db.getDb()).run("UPDATE purchases SET created_at = ? WHERE id = ?", Date.now() - 120000, p.id);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: "success",
            callbacks: [{ txid_in: "tx1", result: "pending", value_coin: 0.1 }],
          }),
          { status: 200 },
        ),
      ),
    );
    expect(await m.reconcile.reconcilePurchase(p.id)).toBe("pending");
    expect((await m.purchases.getPurchase(p.id))!.status).toBe("pending");
  });

  it("throttles repeated attempts for the same purchase", async () => {
    const { m, p } = await seedPurchase();
    await (await m.db.getDb()).run("UPDATE purchases SET created_at = ? WHERE id = ?", Date.now() - 120000, p.id);
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: "success", callbacks: [] }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    expect(await m.reconcile.reconcilePurchase(p.id)).toBe("pending"); // attempted
    expect(await m.reconcile.reconcilePurchase(p.id)).toBe("skipped"); // throttled
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});