import { createVerify } from "node:crypto";

/**
 * CryptAPI (BlockBee) custom payment flow.
 * Docs: https://docs.cryptapi.io/api/raw/api/tickercreate
 *       https://docs.cryptapi.io/webhooks/verify-webhook-signature
 */

const CRYPTAPI_API_BASE = process.env.CRYPTAPI_API_BASE || "https://api.cryptapi.io";

/** Base URL of the CryptAPI API (overridable for staging/tests). */
export function apiBase(): string {
  return process.env.CRYPTAPI_API_BASE || "https://api.cryptapi.io";
}

let cachedPubKey: string | null = null;

/** RSA public key used to sign webhooks (fetched once, cached). */
export async function getGatewayPubKey(): Promise<string> {
  if (process.env.CRYPTAPI_PUBKEY) return process.env.CRYPTAPI_PUBKEY;
  if (cachedPubKey) return cachedPubKey;
  const res = await fetch(`${apiBase()}/pubkey/`);
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
 * ({ticker}/convert/?value=..&from=USD). Accepts a coin id ("btc",
 * "trc20_usdt") or a ticker path. Returns null on any failure —
 * the portal then shows only the USD price.
 */
export async function convertUsdToCoin(coin: string, usd: number): Promise<number | null> {
  if (!Number.isFinite(usd) || usd <= 0) return null;
  const ticker = tickerPath(coin);
  try {
    const res = await fetch(
      `${CRYPTAPI_API_BASE}/${ticker}/convert/?value=${encodeURIComponent(usd)}&from=USD`,
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
  const ticker = tickerPath(coin);
  let url: URL;
  try {
    url = new URL(`${CRYPTAPI_API_BASE}/${ticker}/create/`);
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

/**
 * Optional CryptAPI sender-IP allowlist (docs/how-webhooks-work.md#best-practices:
 * whitelist 51.77.105.132 and 135.125.112.47). Enforcement is opt-in: when
 * CRYPTAPI_ALLOWED_IPS is set (comma-separated), only requests from those IPs
 * are accepted. Default OFF so an IP rotation at CryptAPI can never drop
 * webhooks — signature verification stays the primary gate.
 */
export function senderIpAllowed(clientIp: string | null): boolean {
  const allow = process.env.CRYPTAPI_ALLOWED_IPS;
  if (!allow) return true;
  if (!clientIp) return false;
  return allow.split(",").some((s) => s.trim() === clientIp);
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

/** Encode a coin id into a ticker path ("trc20_usdt" -> "trc20/usdt"). */
function tickerPath(coin: string): string {
  return tickerFor(coin).split("/").map(encodeURIComponent).join("/");
}

/**
 * Parse the USD value out of a CryptAPI convert payload
 * (the JSON-encoded `value_coin_convert` / `value_forwarded_coin_convert`
 * query params). Returns whole USD cents, or null when absent/malformed.
 */
export function usdCentsFromConvertJson(raw: string | null): number | null {
  if (!raw) return null;
  try {
    const conv = JSON.parse(raw) as Record<string, string>;
    const usd = Number(conv.USD);
    return Number.isFinite(usd) && usd > 0 ? Math.round(usd * 100) : null;
  } catch {
    return null;
  }
}

/**
 * Fetch the deposit QR code (base64 PNG data URL) for a payment address.
 * Returns null on any failure — the portal still shows the address.
 */
export async function getQrcode(coin: string, addressIn: string): Promise<string | null> {
  try {
    const res = await fetch(
      `${apiBase()}/${tickerPath(coin)}/qrcode/?address=${encodeURIComponent(addressIn)}&size=300`,
      { signal: AbortSignal.timeout(10000) },
    );
    if (!res.ok) return null;
    const body = (await res.json()) as { qr_code?: string };
    return body?.qr_code ?? null;
  } catch {
    return null;
  }
}

export interface GatewayCallbackLog {
  txidIn: string | null;
  /** CryptAPI's own result field: "pending" | "sent" | "done". */
  result: string;
  /** Amount the customer sent, in coin units (0 when unknown). */
  valueCoin: number;
  /** The exact callback URL of the most recent webhook attempt (query params include uuid + convert data). */
  requestUrl: string | null;
}

/**
 * Fetch callback/payment logs for an address from the CryptAPI logs endpoint.
 * Used to reconcile purchases whose webhook was lost. Returns null on any
 * failure (treated as "no data, leave pending").
 */
export async function getGatewayLogs(coin: string, callbackUrl: string): Promise<GatewayCallbackLog[] | null> {
  try {
    const url = `${apiBase()}/${tickerPath(coin)}/logs/?callback=${encodeURIComponent(callbackUrl)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      status?: string;
      callbacks?: Array<{
        txid_in?: string;
        result?: string;
        value_coin?: number | string;
        logs?: Array<{ request_url?: string }>;
      }>;
    };
    if (body.status !== "success" || !Array.isArray(body.callbacks)) return null;
    return body.callbacks.map((c) => {
      const requestUrl = c.logs?.[0]?.request_url ?? null;
      return {
        txidIn: c.txid_in ?? null,
        result: String(c.result ?? ""),
        valueCoin: Number.isFinite(Number(c.value_coin)) ? Number(c.value_coin) : 0,
        requestUrl,
      };
    });
  } catch {
    return null;
  }
}

/**
 * Convert a coin amount to USD via the global CryptAPI convert endpoint.
 * Returns null on any failure. Fallback for reconciliation when the logged
 * webhook URL carries no convert data.
 */
export async function coinToUsd(coin: string, value: number): Promise<number | null> {
  if (!Number.isFinite(value) || value <= 0) return null;
  try {
    const res = await fetch(
      `${apiBase()}/convert/?value=${encodeURIComponent(value)}&from=${encodeURIComponent(tickerFor(coin))}&to=usd`,
      { signal: AbortSignal.timeout(10000) },
    );
    if (!res.ok) return null;
    const body = (await res.json()) as { value_coin?: number | string };
    const usd = Number(body.value_coin);
    return Number.isFinite(usd) && usd > 0 ? usd : null;
  } catch {
    return null;
  }
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
