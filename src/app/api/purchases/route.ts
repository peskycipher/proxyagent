import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { acceptedCoins, createCharge, payoutWalletFor } from "@/lib/gateway";
import { createPurchase, attachCharge } from "@/lib/purchases";
import { tierFor } from "@/lib/pricing";
import { randomBytes } from "node:crypto";

const bodySchema = z.object({ hours: z.number().int(), coin: z.string().regex(/^[a-z0-9_]+$/) });

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid request" }, { status: 400 });
  const { hours, coin } = parsed.data;

  try {
    tierFor(hours); // throws on unknown tiers
  } catch {
    return NextResponse.json({ error: "unknown block size" }, { status: 400 });
  }

  const payout = payoutWalletFor(coin);
  if (!payout) {
    return NextResponse.json({ error: "coin not supported" }, { status: 400 });
  }

  const purchase = createPurchase(session.user.id, hours, coin);

  // Unique callback URL (CryptAPI treats it as the charge id) carrying our
  // secret path segment + invoice id + one-time nonce, echoed back in callbacks.
  const base = process.env.BASE_URL || "http://localhost:3000";
  const secret = process.env.GATEWAY_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "gateway not configured" }, { status: 500 });
  const callbackUrl = `${base}/api/webhooks/gateway/${secret}?invoice=${encodeURIComponent(purchase.id)}&nonce=${randomBytes(16).toString("hex")}`;

  try {
    const charge = await createCharge({ coin, payoutAddress: payout, callbackUrl });
    attachCharge(purchase.id, charge.addressIn);
    return NextResponse.json({
      purchaseId: purchase.id,
      addressIn: charge.addressIn,
      amountUsdCents: purchase.amount_usd_cents,
      seconds: purchase.seconds,
      minimumTransactionCoin: charge.minimumTransactionCoin,
    });
  } catch (e) {
    return NextResponse.json({ error: `payment gateway error: ${(e as Error).message}` }, { status: 502 });
  }
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ coins: acceptedCoins() });
}