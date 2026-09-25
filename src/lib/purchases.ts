import { getDb, newId, type DbStmt } from "@/lib/db";
import { priceUsdCents, secondsForBlock, tierFor } from "@/lib/pricing";

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
  nonce: string | null;
}

export async function createPurchase(
  userId: string,
  hours: number,
  coin: string,
  nonce?: string,
): Promise<PurchaseRow> {
  tierFor(hours); // throws for unknown block sizes
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
    nonce: nonce ?? null,
  };
  await (await getDb()).run(
    "INSERT INTO purchases (id, user_id, coin, address_in, seconds, amount_usd_cents, status, created_at, nonce) VALUES (?,?,?,?,?,?,?,?,?)",
    row.id, row.user_id, row.coin, null, row.seconds, row.amount_usd_cents, "pending", row.created_at, row.nonce,
  );
  return row;
}

export async function attachCharge(purchaseId: string, addressIn: string): Promise<void> {
  await (await getDb()).run("UPDATE purchases SET address_in = ? WHERE id = ?", addressIn, purchaseId);
}

export async function getPurchase(purchaseId: string): Promise<PurchaseRow | null> {
  return (await (await getDb()).get<PurchaseRow>("SELECT * FROM purchases WHERE id = ?", purchaseId)) ?? null;
}

export async function listPurchases(userId: string, limit = 20): Promise<PurchaseRow[]> {
  return (await getDb())
    .all<PurchaseRow>("SELECT * FROM purchases WHERE user_id = ? ORDER BY created_at DESC LIMIT ?", userId, limit);
}

/**
 * Idempotently confirm a purchase and credit its seconds.
 * `underpaidUsdCents` (optional) marks purchases that received less than the
 * block price; nothing is credited for them.
 *
 * Concurrency & atomicity: the status flip, balance credit, and ledger row
 * are ONE batch — D1 batches run in an implicit transaction (local driver
 * wraps in one too), so a crash mid-confirm leaves the purchase pending and
 * the webhook retry completes it; the `AND status = 'pending'` guard means
 * concurrent deliveries flip it exactly once, and the loser sees 0 changed
 * rows and re-reads the final state.
 */
export async function confirmPurchase(
  purchaseId: string,
  webhookUuid: string,
  receivedUsdCents?: number,
): Promise<{ credited: boolean; userId: string; seconds: number } | null> {
  const db = await getDb();
  const purchase = await getPurchase(purchaseId);
  if (!purchase) return null;
  if (purchase.status !== "pending") {
    // idempotent: confirmed/underpaid/expired are final
    return { credited: false, userId: purchase.user_id, seconds: purchase.seconds };
  }
  const underpaid =
    typeof receivedUsdCents === "number" &&
    receivedUsdCents < purchase.amount_usd_cents - Math.ceil(purchase.amount_usd_cents * 0.02);
  const status = underpaid ? "underpaid" : "confirmed";

  const stmts: DbStmt[] = [
    {
      sql: "UPDATE purchases SET status = ?, confirmed_at = ?, gateway_ref = ? WHERE id = ? AND status = 'pending'",
      params: [status, Date.now(), webhookUuid, purchaseId],
    },
  ];
  if (status === "confirmed") {
    stmts.push(
      {
        sql: "UPDATE users SET balance_seconds = balance_seconds + ? WHERE id = ?",
        params: [purchase.seconds, purchase.user_id],
      },
      {
        sql: "INSERT INTO credit_txns (id, user_id, delta_seconds, reason, ref, created_at) VALUES (?,?,?,?,?,?)",
        params: [newId("txn"), purchase.user_id, purchase.seconds, `purchase:${purchase.id}`, webhookUuid, Date.now()],
      },
    );
  }
  const results = await db.batch(stmts);
  if ((results[0]?.changes ?? 0) === 0) {
    // Another delivery confirmed it first.
    const latest = await getPurchase(purchaseId);
    return latest ? { credited: false, userId: latest.user_id, seconds: latest.seconds } : null;
  }

  return { credited: status === "confirmed", userId: purchase.user_id, seconds: purchase.seconds };
}
