import { getDb, newId } from "@/lib/db";
import { priceUsdCents, secondsForBlock, tierFor } from "@/lib/pricing";
import { credit } from "@/lib/credits";

export interface PurchaseRow {
  id: string;
  user_id: string;
  coin: string;
  address_in: string | null;
  seconds: number;
  amount_usd_cents: number;
  status: "pending" | "confirmed" | "expired" | "underpaid";
  created_at: number;
  confirmed_at: number | null;
  gateway_ref: string | null;
}

export function createPurchase(userId: string, hours: number, coin: string): PurchaseRow {
  tierFor(hours); // throws for unknown block sizes
  const db = getDb();
  const row: PurchaseRow = {
    id: newId("pur"),
    user_id: userId,
    coin,
    address_in: null,
    seconds: secondsForBlock(hours),
    amount_usd_cents: priceUsdCents(hours),
    status: "pending",
    created_at: Date.now(),
    confirmed_at: null,
    gateway_ref: null,
  };
  db.prepare(
    "INSERT INTO purchases (id, user_id, coin, address_in, seconds, amount_usd_cents, status, created_at) VALUES (?,?,?,?,?,?,?,?)",
  ).run(row.id, row.user_id, row.coin, null, row.seconds, row.amount_usd_cents, "pending", row.created_at);
  return row;
}

export function attachCharge(purchaseId: string, addressIn: string): void {
  getDb().prepare("UPDATE purchases SET address_in = ? WHERE id = ?").run(addressIn, purchaseId);
}

export function getPurchase(purchaseId: string): PurchaseRow | null {
  return (getDb().prepare("SELECT * FROM purchases WHERE id = ?").get(purchaseId) as PurchaseRow | undefined) ?? null;
}

export function listPurchases(userId: string, limit = 20): PurchaseRow[] {
  return getDb()
    .prepare("SELECT * FROM purchases WHERE user_id = ? ORDER BY created_at DESC LIMIT ?")
    .all(userId, limit) as PurchaseRow[];
}

/**
 * Idempotently confirm a purchase and credit its seconds.
 * `underpaidUsdCents` (optional) marks purchases that received less than the
 * block price; nothing is credited for them.
 */
export function confirmPurchase(
  purchaseId: string,
  webhookUuid: string,
  receivedUsdCents?: number,
): { credited: boolean; userId: string; seconds: number } | null {
  const db = getDb();
  let result: { credited: boolean; userId: string; seconds: number } | null = null;
  const txn = db.transaction(() => {
    const purchase = getPurchase(purchaseId);
    if (!purchase) return;
    if (purchase.status !== "pending") {
      // idempotent: confirmed/underpaid/expired are final
      result = { credited: false, userId: purchase.user_id, seconds: purchase.seconds };
      return;
    }
    const underpaid =
      typeof receivedUsdCents === "number" &&
      receivedUsdCents < purchase.amount_usd_cents - Math.ceil(purchase.amount_usd_cents * 0.02);
    const status = underpaid ? "underpaid" : "confirmed";
    db.prepare("UPDATE purchases SET status = ?, confirmed_at = ?, gateway_ref = ? WHERE id = ?").run(
      status,
      Date.now(),
      webhookUuid,
      purchaseId,
    );
    if (status === "confirmed") {
      credit(purchase.user_id, purchase.seconds, `purchase:${purchase.id}`, webhookUuid);
      result = { credited: true, userId: purchase.user_id, seconds: purchase.seconds };
    } else {
      result = { credited: false, userId: purchase.user_id, seconds: purchase.seconds };
    }
  });
  txn();
  return result;
}