import { getGatewayPubKey, usdCentsFromConvertJson, verifyWebhookSignature } from "@/lib/gateway";
import { confirmPurchase, getPurchase } from "@/lib/purchases";
import { logger } from "@/lib/logger";

/**
 * CryptAPI callback endpoint. Secret path segment (GATEWAY_WEBHOOK_SECRET)
 * + RSA-SHA256 signature in x-ca-signature must both check out.
 * CryptAPI (GET webhooks) expects the literal response body "*ok*".
 *
 * Per the CryptAPI docs, GET webhooks sign the full URL; POST webhooks
 * (post=1) sign the raw body. Both are supported here.
 */
async function handle(req: Request, { params }: { params: Promise<{ secret: string }> }) {
  const { secret } = await params;
  const expectedSecret = process.env.GATEWAY_WEBHOOK_SECRET;
  if (!expectedSecret || secret !== expectedSecret) {
    return new Response("not found", { status: 404 });
  }

  let url: URL;
  try {
    url = new URL(req.url);
  } catch {
    return new Response("bad request", { status: 400 });
  }
  const invoiceId = url.searchParams.get("invoice");
  if (!invoiceId) return new Response("missing invoice", { status: 400 });

  const isPost = req.method === "POST";

  // Signature data: the exact URL CryptAPI requested for GET webhooks; the
  // raw body for POST webhooks (CryptAPI docs, verify-webhook-signature).
  const signature = req.headers.get("x-ca-signature");
  let signedData: string;
  if (isPost) {
    signedData = await req.text();
  } else {
    let proto = req.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
    const host = req.headers.get("host") ?? url.host;
    signedData = `${proto}://${host}${url.pathname}${url.search}`;
  }
  let verified = false;
  try {
    const pubkey = await getGatewayPubKey();
    verified = verifyWebhookSignature(signedData, signature, pubkey);
  } catch {
    verified = false;
  }
  if (!verified) {
    logger.error("webhook signature verification failed", { invoiceId });
    return new Response("unauthorized", { status: 401 });
  }

  const purchase = await getPurchase(invoiceId);
  if (!purchase) return new Response("unknown invoice", { status: 400 });

  // CryptAPI best practice: reject callbacks whose nonce doesn't match the
  // value stored at purchase creation (defense in depth on top of the
  // signature check). Legacy purchases predating the nonce column pass.
  const nonce = url.searchParams.get("nonce");
  if (purchase.nonce && nonce !== purchase.nonce) {
    logger.error("webhook nonce mismatch", { invoiceId });
    return new Response("forbidden", { status: 403 });
  }

  // With post=1 the payload fields arrive in the body; custom params (invoice,
  // nonce) always stay in the query string (CryptAPI docs).
  let fields: URLSearchParams;
  if (isPost) {
    fields = new URLSearchParams(signedData);
  } else {
    fields = url.searchParams;
  }

  const pending = fields.get("pending");
  const uuid = fields.get("uuid") ?? "";

  if (pending === "0") {
    if (!uuid) {
      // gateway_ref doubles as the webhook idempotency key — a confirmed
      // webhook without a uuid cannot be processed safely.
      return new Response("missing uuid", { status: 400 });
    }
    // Confirmed webhook. USD received guards against underpayment: prefer the
    // GROSS converted value (value_coin_convert = before CryptAPI fees) so a
    // customer who paid in full is never misclassified by fee deduction;
    // fall back to the forwarded value when the gross one is absent.
    const receivedUsdCents =
      usdCentsFromConvertJson(fields.get("value_coin_convert")) ??
      usdCentsFromConvertJson(fields.get("value_forwarded_coin_convert")) ??
      undefined;
    await confirmPurchase(invoiceId, uuid, receivedUsdCents);
  }
  // pending=1 callbacks only acknowledge detection; no crediting.

  return new Response("*ok*", { status: 200, headers: { "content-type": "text/plain" } });
}

export const GET = handle;
export const POST = handle;