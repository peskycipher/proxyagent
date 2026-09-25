/**
 * Cloudflare Turnstile server-side verification (siteverify), canonical form:
 * require success === true, the expected action, and an approved frontend
 * hostname. Opt-in via env — when TURNSTILE_SECRET is unset, verification is a
 * no-op (local/dev mode), matching how the OAuth providers are gated.
 *
 *   TURNSTILE_SECRET      widget secret key (wrangler secret put; never in chat)
 *   TURNSTILE_HOSTNAMES   comma-separated frontend hostnames this backend serves.
 *                         Production value must NOT include localhost/127.0.0.1.
 */

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export interface TurnstileResult {
  /** true when verification passed or captcha is not configured. */
  ok: boolean;
  /** Set when ok=false and the caller should show a message. */
  reason?: "missing-token" | "invalid-token";
}

export async function verifyTurnstileToken(
  token: string | undefined | null,
  expectedActions: string | string[],
  remoteIp?: string | null,
): Promise<TurnstileResult> {
  const secret = process.env.TURNSTILE_SECRET;
  if (!secret) return { ok: true }; // captcha not configured
  if (typeof token !== "string" || token.length === 0 || token.length > 2048) {
    return { ok: false, reason: "missing-token" };
  }
  const expectedHostnames = (process.env.TURNSTILE_HOSTNAMES ?? "")
    .split(",")
    .map((h) => h.trim())
    .filter(Boolean);
  if (expectedHostnames.length === 0) {
    // Misconfigured deployment: hostname validation is part of the check.
    return { ok: false, reason: "invalid-token" };
  }
  const actions = Array.isArray(expectedActions) ? expectedActions : [expectedActions];
  try {
    const body = new URLSearchParams({ secret, response: token });
    if (remoteIp) body.set("remoteip", remoteIp);
    const res = await fetch(SITEVERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return { ok: false, reason: "invalid-token" };
    const data = (await res.json()) as {
      success?: boolean;
      action?: string;
      hostname?: string;
    };
    // Exactly one siteverify call per token (tokens are single-use) — decide
    // on success + action + hostname from that single response.
    if (
      !data.success ||
      !actions.includes(data.action ?? "") ||
      !expectedHostnames.includes(data.hostname ?? "")
    ) {
      return { ok: false, reason: "invalid-token" };
    }
    return { ok: true };
  } catch {
    // Network failure against siteverify: fail closed — a captcha outage must
    // not become an auth bypass.
    return { ok: false, reason: "invalid-token" };
  }
}

/** Human-readable message for a failed check. */
export function turnstileErrorMessage(r: TurnstileResult): string {
  return r.reason === "missing-token"
    ? "Please complete the captcha."
    : "Captcha verification failed — try again.";
}