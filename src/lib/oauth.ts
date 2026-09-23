/**
 * Verified-email gate for OAuth account linking.
 *
 * Returns the user's email ONLY when the provider has verified it. Used to
 * decide whether an OAuth sign-in may link to (or create) a local account:
 * without this check, an attacker who controls a provider account carrying a
 * victim's unverified email could take over that local account.
 *
 * - Google: the OIDC profile carries `email_verified` — gate directly on it.
 * - GitHub: the raw /user profile has no verification flag (and @auth/core's
 *   provider mapping drops whatever existed), so re-fetch /user/emails with
 *   the access token and require a `verified: true` entry matching the email.
 * - Anything else: fail closed (deny) until explicitly supported.
 */
/**
 * Short-TTL dedupe for GitHub /user/emails: a single sign-in asks the same
 * question twice (signIn callback decision, then the jwt callback backstop)
 * with the same token seconds apart. Cache per fetch client so distinct
 * fetchImpls (tests) stay isolated; one sign-in costs one provider call.
 */
const verifiedCacheByFetch = new WeakMap<
  typeof fetch,
  Map<string, { email: string | null; expires: number }>
>();
const VERIFIED_EMAIL_TTL_MS = 60_000;

export async function oauthVerifiedEmail(
  account: { provider?: string; access_token?: string } | null | undefined,
  user: { email?: string | null } | null | undefined,
  profile?: Record<string, unknown> | null,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  if (!account?.provider || !user?.email) return null;

  if (account.provider === "google") {
    return profile?.email_verified === true ? user.email : null;
  }

  if (account.provider === "github" && account.access_token) {
    let cache = verifiedCacheByFetch.get(fetchImpl);
    if (!cache) verifiedCacheByFetch.set(fetchImpl, (cache = new Map()));
    const cached = cache.get(account.access_token);
    if (cached && cached.expires > Date.now()) return cached.email;
    try {
      const res = await fetchImpl("https://api.github.com/user/emails", {
        headers: {
          Authorization: `Bearer ${account.access_token}`,
          Accept: "application/vnd.github+json",
          "User-Agent": "proxy-agent",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      });
      if (!res.ok) return null;
      const emails = (await res.json()) as Array<{ email: string; verified: boolean }>;
      const match = emails.find(
        (e) => e.verified && e.email.toLowerCase() === user.email!.toLowerCase(),
      );
      const verified = match?.email.toLowerCase() ?? null;
      cache.set(account.access_token, {
        email: verified,
        expires: Date.now() + VERIFIED_EMAIL_TTL_MS,
      });
      return verified;
    } catch {
      return null; // verification unavailable — deny rather than assume
    }
  }

  return null;
}

/** Thrown by the jwt-callback backstop when an unverified OAuth email would link. */
export class OAuthEmailNotVerifiedError extends Error {
  constructor() {
    super("OAuth provider email is not verified");
    this.name = "OAuthEmailNotVerifiedError";
  }
}

export type OAuthSignInDecision =
  | { allow: true }
  | { allow: false; reason: "unverified-email" };

/**
 * Sign-in-level decision for the Auth.js `signIn` callback, which runs BEFORE
 * the jwt callback and can return a redirect URL — so an unverified email can
 * be refused with a distinct, user-visible error instead of an anonymous one.
 *
 * Credentials sign-ins already carry the local id; email-less OAuth identities
 * have nothing to link by email — both are allowed. An OAuth identity whose
 * provider email is unverified (or whose provider is not supported) is denied.
 */
export async function oauthSignInDecision(
  account: { provider?: string; type?: string; access_token?: string } | null | undefined,
  user: { id?: string; email?: string | null } | null | undefined,
  profile?: Record<string, unknown> | null,
  fetchImpl: typeof fetch = fetch,
): Promise<OAuthSignInDecision> {
  if (typeof user?.id === "string" && user.id.startsWith("usr_")) return { allow: true };
  if (!account || account.type === "credentials") return { allow: true };
  if (!user?.email) return { allow: true }; // nothing to link on
  const verified = await oauthVerifiedEmail(account, user, profile, fetchImpl);
  return verified ? { allow: true } : { allow: false, reason: "unverified-email" };
}
