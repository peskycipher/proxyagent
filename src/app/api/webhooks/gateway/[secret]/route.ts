import { NextResponse } from "next/server";
import { getGatewayPubKey, verifyWebhookSignature } from "@/lib/gateway";
import { confirmPurchase, getPurchase } from "@/lib/purchases";

/**
 * CryptAPI callback endpoint. Secret path segment (GATEWAY_WEBHOOK_SECRET)
 * + RSA-SHA256 signature in x-ca-signature must both check out.
 * CryptAPI (GET webhooks) expects the literal response body "*ok*".
 */
async function handle(req: Request, { params }: { params: Promise<{ secret: string }> }) {
  const { secret } = await params;
  const expectedSecret = process.env.GATEWAY_WEBHOOK_SECRET;
  if (!expectedSecret || secret !== expectedSecret) {
    return new Response("not found", { status: 404 });
  }

  const url = new URL(req.url);
  const invoiceId = url.searchParams.get("invoice");
  if (!invoiceId) return new Response("missing invoice", { status: 400 });

  // Verify signature over the exact URL CryptAPI requested.
  const signature = req.headers.get("x-ca-signature");
  let proto = req.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  const host = req.headers.get("host") ?? url.host;
  const reconstructed = `${proto}://${host}${url.pathname}${url.search}`;
  let verified = false;
  try {
    const pubkey = await getGatewayPubKey();
    verified = verifyWebhookSignature(reconstructed, signature, pubkey);
  } catch {
    verified = false;
  }
  if (!verified) {
    console.error("webhook signature verification failed", { invoiceId });
    return new Response("unauthorized", { status: 401 });
  }

  const purchase = await getPurchase(invoiceId);
  if (!purchase) return new Response("unknown invoice", { status: 400 });

  const pending = url.searchParams.get("pending");
  const uuid = url.searchParams.get("uuid") ?? "";

  if (pending === "0") {
    // Confirmed webhook. USD received (convert=1) guards against underpayment;
    // without convert data we accept the confirmed amount as-is.
    let receivedUsdCents: number | undefined;
    const convertRaw = url.searchParams.get("value_forwarded_coin_convert");
    if (convertRaw) {
      try {
        const conv = JSON.parse(convertRaw) as Record<string, string>;
        const usd = Number(conv.USD);
        if (Number.isFinite(usd) && usd > 0) receivedUsdCents = Math.round(usd * 100);
      } catch {
        // ignore malformed conversion data
      }
    }
    await confirmPurchase(invoiceId, uuid || `unverified_${Date.now()}`, receivedUsdCents);
  }
  // pending=1 callbacks only acknowledge detection; no crediting.

  return new Response("*ok*", { status: 200, headers: { "content-type": "text/plain" } });
}

export const GET = handle;
export const POST = handle;