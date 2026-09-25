import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { acceptedCoins, createCharge, payoutWalletFor, tickerFor } from "@/lib/gateway";
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

  // CryptAPI best practice: generate the unguessable nonce before creating the
  // purchase, store it with the order, and embed it in the callback URL — the
  // webhook handler rejects callbacks whose nonce doesn't match what we stored.
  const nonce = randomBytes(16).toString("hex");
  const purchase = await createPurchase(session.user.id, hours, coin, nonce);

  // Unique callback URL (CryptAPI treats it as the charge id) carrying our
  // secret path segment + invoice id + one-time nonce, echoed back in callbacks.
  // CryptAPI rejects non-public callback hosts ("Callback URL malformed"), so a
  // missing/mis-set BASE_URL must fail loudly here rather than 400 downstream.
  const base = process.env.BASE_URL || "";
  if (!/^https:\/\//.test(base)) {
    return NextResponse.json(
      { error: "gateway misconfigured: BASE_URL must be an https:// public URL" },
      { status: 500 }
    );
  }
  const secret = process.env.GATEWAY_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "gateway not configured" }, { status: 500 });
  const callbackUrl = `${base}/api/webhooks/gateway/${secret}?invoice=${encodeURIComponent(purchase.id)}&nonce=${nonce}`;

  try {
    const charge = await createCharge({ coin, payoutAddress: payout, callbackUrl });
    await attachCharge(purchase.id, charge.addressIn);
    // CryptAPI best practice: show a scannable QR of the deposit address.
    // Non-fatal — if the QR endpoint hiccups the address is still displayed.
    const ticker = tickerFor(coin).split("/").map(encodeURIComponent).join("/");
    const qr = await fetch(
      `https://api.cryptapi.io/${ticker}/qrcode/?address=${encodeURIComponent(charge.addressIn)}&size=300`,
      { signal: AbortSignal.timeout(10000) },
    )
      .then((r) => (r.ok ? (r.json() as { qr_code?: string }) : null))
      .then((b) => b?.qr_code ?? null)
      .catch(() => null);
    return NextResponse.json({
      purchaseId: purchase.id,
      addressIn: charge.addressIn,
      amountUsdCents: purchase.amount_usd_cents,
      seconds: purchase.seconds,
      minimumTransactionCoin: charge.minimumTransactionCoin,
      qrCode: qr,
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
