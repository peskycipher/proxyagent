import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getPurchase } from "@/lib/purchases";
import { reconcilePurchase } from "@/lib/reconcile";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  let purchase = await getPurchase(id);
  if (!purchase || purchase.user_id !== session.user.id) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  // Webhook-loss reconciliation (CryptAPI logs endpoint as backup to webhooks):
  // best effort on stale pending purchases; failures leave the status as-is.
  if (purchase.status === "pending") {
    try {
      await reconcilePurchase(purchase.id);
      purchase = (await getPurchase(id)) ?? purchase;
    } catch (e) {
      console.error("reconcile failed", { id, error: (e as Error).message });
    }
  }
  return NextResponse.json({
    status: purchase.status,
    addressIn: purchase.address_in,
    amountUsdCents: purchase.amount_usd_cents,
    seconds: purchase.seconds,
  });
}
