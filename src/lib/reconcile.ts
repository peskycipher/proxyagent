import { coinToUsd, getGatewayLogs, usdCentsFromConvertJson } from "@/lib/gateway";
import { confirmPurchase, expirePurchase, getPurchase } from "@/lib/purchases";

/**
 * Webhook-loss reconciliation (CryptAPI docs recommend the logs endpoint as a
 * backup to webhooks). The portal polls /api/purchases/[id] while a purchase
 * is pending; that poll triggers this for stale pending purchases, so a
 * payment whose webhook was lost or blocked still settles.
 *
 * Confirmation via logs reuses the exact webhook logic — uuid, convert-based
 * underpayment guard, idempotent confirm — by parsing the logged webhook URL.
 */

/** Reconciliation only kicks in for purchases older than this. */
const RECONCILE_AFTER_MS = 60_000;
/** Purchases with no deposit at all in the logs expire after this. */
const EXPIRE_AFTER_MS = 72 * 3600_000;
/** Minimum interval between log fetches for one purchase (per process). */
const MIN_ATTEMPT_INTERVAL_MS = 60_000;

const lastAttemptAt = new Map<string, number>();

export type ReconcileResult = "confirmed" | "underpaid" | "expired" | "pending" | "skipped";

function callbackUrlFor(purchase: { id: string; nonce: string | null }): string | null {
  const base = process.env.BASE_URL;
  const secret = process.env.GATEWAY_WEBHOOK_SECRET;
  if (!base || !secret || !purchase.nonce) return null;
  return `${base}/api/webhooks/gateway/${secret}?invoice=${encodeURIComponent(purchase.id)}&nonce=${purchase.nonce}`;
}

/**
 * Check a pending purchase against CryptAPI's logs endpoint and settle it if
 * the blockchain shows a confirmed payment that never reached our webhook.
 * Best effort: any failure leaves the purchase pending for the next poll.
 */
export async function reconcilePurchase(purchaseId: string): Promise<ReconcileResult> {
  const purchase = await getPurchase(purchaseId);
  if (!purchase || purchase.status !== "pending" || !purchase.address_in) return "skipped";

  const now = Date.now();
  const age = now - purchase.created_at;
  if (age < RECONCILE_AFTER_MS) return "skipped";

  const last = lastAttemptAt.get(purchaseId) ?? 0;
  if (now - last < MIN_ATTEMPT_INTERVAL_MS) return "skipped";
  lastAttemptAt.set(purchaseId, now);

  const callbackUrl = callbackUrlFor(purchase);
  if (!callbackUrl) return "skipped";

  const callbacks = await getGatewayLogs(purchase.coin, callbackUrl);
  if (!callbacks) return "pending"; // logs unavailable — leave pending

  // "sent"/"done" entries are confirmed payments ("pending" = still confirming).
  const confirmed = callbacks.filter((c) => (c.result === "sent" || c.result === "done") && c.txidIn);

  if (confirmed.length > 0) {
    // Latest confirmed entry first is not guaranteed; take the last one.
    const latest = confirmed[confirmed.length - 1];
    // The logged webhook URL carries the exact query params CryptAPI sent:
    // uuid plus (with convert=1) the USD conversion of the payment.
    let receivedUsdCents: number | undefined;
    let uuid: string | undefined;
    if (latest.requestUrl) {
      try {
        const q = new URL(latest.requestUrl).searchParams;
        uuid = q.get("uuid") ?? undefined;
        // Gross amount first (value_coin_convert = before CryptAPI fees);
        // fall back to the forwarded (net) value if the gross one is absent.
        receivedUsdCents =
          usdCentsFromConvertJson(q.get("value_coin_convert")) ??
          usdCentsFromConvertJson(q.get("value_forwarded_coin_convert")) ??
          undefined;
      } catch {
        // malformed logged URL — fall through to the coin→USD conversion
      }
    }
    if (receivedUsdCents === undefined && latest.valueCoin > 0) {
      const usd = await coinToUsd(purchase.coin, latest.valueCoin);
      if (usd !== null) receivedUsdCents = Math.round(usd * 100);
    }
    await confirmPurchase(purchase.id, uuid ?? `reconcile:${latest.txidIn}`, receivedUsdCents);
    return receivedUsdCents !== undefined && (await getPurchase(purchaseId))?.status === "underpaid"
      ? "underpaid"
      : "confirmed";
  }

  // No deposit seen at all: give the customer a generous window, then expire.
  if (callbacks.length === 0 && age > EXPIRE_AFTER_MS) {
    await expirePurchase(purchase.id);
    return "expired";
  }

  return "pending";
}