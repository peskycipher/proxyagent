import { NextResponse } from "next/server";
import { requireUser, unauthorized } from "@/lib/route-session";
import { getPurchase } from "@/lib/purchases";
import { reconcilePurchase } from "@/lib/reconcile";
import { logger } from "@/lib/logger";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return unauthorized();
  const { id } = await params;
  let purchase = await getPurchase(id);
  if (!purchase || purchase.user_id !== user.id) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  // Webhook-loss reconciliation (CryptAPI logs endpoint as backup to webhooks):
  // best effort on stale pending purchases; failures leave the status as-is.
  if (purchase.status === "pending") {
    try {
      await reconcilePurchase(purchase.id);
      purchase = (await getPurchase(id)) ?? purchase;
    } catch (e) {
      logger.error("reconcile failed", { id, error: (e as Error).message });
    }
  }
  return NextResponse.json({
    status: purchase.status,
    addressIn: purchase.address_in,
    amountUsdCents: purchase.amount_usd_cents,
    seconds: purchase.seconds,
  });
}
