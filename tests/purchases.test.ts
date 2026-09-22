import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { generateKeyPairSync, createSign } from "node:crypto";
import path from "node:path";
import fs from "node:fs";
import { vi } from "vitest";

const TMP = path.join(process.cwd(), "data", "test-purchases.db");

async function fresh() {
  fs.mkdirSync(path.dirname(TMP), { recursive: true });
  if (fs.existsSync(TMP)) fs.rmSync(TMP);
  process.env.APP_DB_PATH = TMP;
  const db = await import("@/lib/db");
  const users = await import("@/lib/users");
  const purchases = await import("@/lib/purchases");
  const credits = await import("@/lib/credits");
  return { users, purchases, credits, getPurchase: purchases.getPurchase, createPurchase: purchases.createPurchase, confirmPurchase: purchases.confirmPurchase, balanceSeconds: credits.balanceSeconds, txnsFor: credits.txnsFor, createUser: users.createUser };
}

afterEach(() => {
  if (fs.existsSync(TMP)) fs.rmSync(TMP);
  delete process.env.APP_DB_PATH;
});

describe("gateway webhook signature", () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();
  const url = "https://site.example/api/webhooks/gateway/secret?uuid=abc&pending=0&invoice=pur_1";

  it("accepts a valid RSA-SHA256 signature over the full URL", async () => {
    const { verifyWebhookSignature } = await import("@/lib/gateway");
    const signer = createSign("RSA-SHA256");
    signer.update(url);
    const sig = signer.sign(privateKey, "base64");
    expect(verifyWebhookSignature(url, sig, publicKeyPem)).toBe(true);
  });

  it("rejects tampered data and missing signatures", async () => {
    const { verifyWebhookSignature } = await import("@/lib/gateway");
    const signer = createSign("RSA-SHA256");
    signer.update(url);
    const sig = signer.sign(privateKey, "base64");
    expect(verifyWebhookSignature(url + "&x=1", sig, publicKeyPem)).toBe(false);
    expect(verifyWebhookSignature(url, null, publicKeyPem)).toBe(false);
  });
});

describe("purchases", () => {
  it("creates a purchase with tier price and seconds", async () => {
    const { createUser, createPurchase } = await fresh();
    const uid = createUser("u1@example.com", "password123");
    const p = createPurchase(uid, 3, "btc");
    expect(p.amount_usd_cents).toBe(302);
    expect(p.seconds).toBe(10800);
    expect(p.status).toBe("pending");
  });

  it("confirmPurchase is idempotent and credits exactly once", async () => {
    const { createUser, createPurchase, confirmPurchase, balanceSeconds, txnsFor } = await fresh();
    const uid = createUser("u2@example.com", "password123");
    const p = createPurchase(uid, 1, "btc");
    const first = confirmPurchase(p.id, "uuid-1", 106);
    expect(first!.credited).toBe(true);
    const second = confirmPurchase(p.id, "uuid-2", 106);
    expect(second!.credited).toBe(false); // already confirmed
    expect(balanceSeconds(uid)).toBe(3600);
    expect(txnsFor(uid).length).toBe(1);
  });

  it("marks underpaid purchases and credits nothing", async () => {
    const { createUser, createPurchase, confirmPurchase, balanceSeconds, getPurchase } = await fresh();
    const uid = createUser("u3@example.com", "password123");
    const p = createPurchase(uid, 12, "ltc");
    const res = confirmPurchase(p.id, "uuid-3", 500); // under 1081-2% tolerance
    expect(res!.credited).toBe(false);
    expect(getPurchase(p.id)!.status).toBe("underpaid");
    expect(balanceSeconds(uid)).toBe(0);
  });
});