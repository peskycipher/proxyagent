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
  coin: string; // lowercase coin id, e.g. "btc", "trc20_usdt" (network-qualified)
  payoutAddress: string;
  callbackUrl: string; // must be unique per charge (embed invoice id + nonce)
  confirmations?: number;
}

export interface Charge {
  addressIn: string;
  callbackUrl: string;
  minimumTransactionCoin: number;
}

/**
 * Convert a USD amount to the coin amount via CryptAPI's convert endpoint
 * ({ticker}/convert/?value=..&from=USD). Returns null on any failure —
 * the portal then shows only the USD price. Ticker is the CryptAPI path
 * form (e.g. "btc", "trc20/usdt").
 */
export async function convertUsdToCoin(ticker: string, usd: number): Promise<number | null> {
  if (!Number.isFinite(usd) || usd <= 0) return null;
  try {
    const res = await fetch(
      `https://api.cryptapi.io/${ticker}/convert/?value=${encodeURIComponent(usd)}&from=USD`,
      { signal: AbortSignal.timeout(10000) },
    );
    if (!res.ok) return null;
    const body = (await res.json()) as { value_coin?: number | string };
    const v = Number(body.value_coin);
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

/**
 * Native coins CryptAPI only exposes in network/token form (bare "sol" 404s
 * with "Resource not found" on /create/; "sol/sol" is the valid path).
 */
const NATIVE_TICKER_PATHS: Record<string, string> = {
  sol: "sol/sol",
};

/**
 * Coin id -> CryptAPI ticker: the last underscore becomes a path segment, so
 * "trc20_usdt" -> "trc20/usdt" while plain coins ("btc", "zec") pass through.
 */
export function tickerFor(coin: string): string {
  if (NATIVE_TICKER_PATHS[coin]) return NATIVE_TICKER_PATHS[coin];
  const i = coin.lastIndexOf("_");
  return i === -1 ? coin : `${coin.slice(0, i)}/${coin.slice(i + 1)}`;
}

/** Create a payment address via CryptAPI. */
export async function createCharge(params: CreateChargeParams): Promise<Charge> {
  const { coin, payoutAddress, callbackUrl, confirmations = 1 } = params;
  if (!payoutAddress) throw new Error(`no payout wallet configured for coin ${coin}`);
  const ticker = tickerFor(coin).split("/").map(encodeURIComponent).join("/");
  let url: URL;
  try {
    url = new URL(`https://api.cryptapi.io/${ticker}/create/`);
  } catch {
    throw new Error(`invalid gateway ticker for coin ${coin}`);
  }
  url.searchParams.set("callback", callbackUrl);
  url.searchParams.set("address", payoutAddress);
  url.searchParams.set("pending", "1");
  // CryptAPI best practice: request converted values so confirmed webhooks carry
  // value_forwarded_coin_convert (USD) — used as the underpayment guard.
  url.searchParams.set("convert", "1");
  url.searchParams.set("confirmations", String(confirmations));
  const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) {
    // CryptAPI's error body names the actual problem (invalid address,
    // unsupported coin, network mismatch) — surface it, don't discard it.
    const detail = await res.text().catch(() => "");
    throw new Error(`gateway create failed: ${res.status}${detail ? ` — ${detail.slice(0, 200)}` : ""}`);
  }
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
