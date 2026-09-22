import { createVerify } from "node:crypto";

/**
 * CryptAPI (BlockBee) custom payment flow.
 * Docs: https://docs.cryptapi.io/api/raw/api/tickercreate
 *       https://docs.cryptapi.io/webhooks/verify-webhook-signature
 */

const CRYPTAPI_API_BASE = process.env.CRYPTAPI_API_BASE || "https://api.cryptapi.io";

let cachedPubKey: string | null = null;

/** RSA public key used to sign webhooks (fetched once, cached). */
export async function getGatewayPubKey(): Promise<string> {
  if (process.env.CRYPTAPI_PUBKEY) return process.env.CRYPTAPI_PUBKEY;
  if (cachedPubKey) return cachedPubKey;
  const res = await fetch("https://api.cryptapi.io/pubkey/");
  if (!res.ok) throw new Error(`failed to fetch gateway public key: ${res.status}`);
  cachedPubKey = await res.text();
  return cachedPubKey;
}

export interface CreateChargeParams {
  coin: string; // lowercase ticker, e.g. "btc", "ltc"
  payoutAddress: string;
  callbackUrl: string; // must be unique per charge (embed invoice id + nonce)
  confirmations?: number;
}

export interface Charge {
  addressIn: string;
  callbackUrl: string;
  minimumTransactionCoin: number;
}

/** Create a payment address via CryptAPI. */
export async function createCharge(params: CreateChargeParams): Promise<Charge> {
  const { coin, payoutAddress, callbackUrl, confirmations = 1 } = params;
  if (!payoutAddress) throw new Error(`no payout wallet configured for coin ${coin}`);
  const url = new URL(`https://api.cryptapi.io/${encodeURIComponent(coin)}/create/`);
  url.searchParams.set("callback", callbackUrl);
  url.searchParams.set("address", payoutAddress);
  url.searchParams.set("pending", "1");
  url.searchParams.set("confirmations", String(confirmations));
  const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`gateway create failed: ${res.status}`);
  const body = (await res.json()) as Record<string, unknown>;
  if (body.status !== "success") {
    throw new Error(`gateway create error: ${body.error ?? JSON.stringify(body)}`);
  }
  return {
    addressIn: String(body.address_in),
    callbackUrl: String(body.callback_url),
    minimumTransactionCoin: Number(body.minimum_transaction_coin ?? 0),
  };
}

/** Coins we accept, from CRYPTAPI_WALLETS_<TICKER> env vars. */
export function acceptedCoins(): string[] {
  return Object.entries(process.env)
    .filter(([k, v]) => k.startsWith("CRYPTAPI_WALLETS_") && v)
    .map(([k]) => k.replace("CRYPTAPI_WALLETS_", "").toLowerCase());
}

export function payoutWalletFor(coin: string): string | undefined {
  return process.env[`CRYPTAPI_WALLETS_${coin.toUpperCase()}`];
}

/**
 * Verify an incoming webhook signature (RSA-SHA256, x-ca-signature header,
 * base64; signed data is the full URL for GET webhooks, raw body for POST).
 */
export function verifyWebhookSignature(signedData: string, signatureB64: string | null, publicKeyPem: string): boolean {
  if (!signatureB64) return false;
  try {
    const verifier = createVerify("RSA-SHA256");
    verifier.update(signedData);
    return verifier.verify(publicKeyPem, Buffer.from(signatureB64, "base64"));
  } catch {
    return false;
  }
}