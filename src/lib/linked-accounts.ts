import { cookies } from "next/headers";
import { getDb } from "@/lib/db";

/**
 * Linked OAuth accounts (Google / GitHub) attached to a local user profile.
 *
 * Rows are written by the auth callbacks in src/auth.ts:
 * - explicit link flow (profile settings) — gated on a verified provider email
 *   plus a short-lived link-intent cookie carrying the signed-in user id;
 * - ordinary OAuth sign-ins — refreshed by verified email (existing behavior).
 *
 * The (provider, provider_account_id) unique index means one provider identity
 * can be bound to at most one local user.
 */

export const LINKED_PROVIDERS = ["google", "github"] as const;
export type LinkedProvider = (typeof LINKED_PROVIDERS)[number];

export function isLinkedProvider(provider: string): provider is LinkedProvider {
  return (LINKED_PROVIDERS as readonly string[]).includes(provider);
}

export function providerAvailable(provider: LinkedProvider): boolean {
  return provider === "google"
    ? Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
    : Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET);
}

export function availableProviders(): LinkedProvider[] {
  return LINKED_PROVIDERS.filter(providerAvailable);
}

export interface LinkedAccountRow {
  user_id: string;
  provider: string;
  provider_account_id: string;
  provider_email: string | null;
  provider_picture: string | null;
  created_at: number;
}

export async function listLinkedAccounts(userId: string): Promise<LinkedAccountRow[]> {
  return (await getDb()).all<LinkedAccountRow>(
    "SELECT user_id, provider, provider_account_id, provider_email, provider_picture, created_at FROM linked_accounts WHERE user_id = ?",
    userId,
  );
}

/** Extracts the public avatar URL from a provider profile, when present. */
export function providerPictureFromProfile(profile?: Record<string, unknown> | null): string | null {
  const url = profile?.picture ?? profile?.avatar_url; // google: picture, github: avatar_url
  return typeof url === "string" && url.startsWith("https://") ? url : null;
}

/**
 * The linked-provider picture to show as the profile avatar fallback
 * (uploaded pictures take precedence). Google is preferred over GitHub when
 * both are linked. GitHub avatars are public per account id, so a missing
 * stored URL can be synthesized; Google's can only come from sign-in.
 */
export async function linkedAvatarFor(userId: string): Promise<string | null> {
  const row = await (await getDb()).get<{ provider: string; provider_account_id: string; provider_picture: string | null }>(
    "SELECT provider, provider_account_id, provider_picture FROM linked_accounts WHERE user_id = ? ORDER BY provider_picture IS NULL ASC, CASE provider WHEN 'google' THEN 0 ELSE 1 END, created_at ASC",
    userId,
  );
  if (!row) return null;
  if (row.provider_picture) return row.provider_picture;
  // GitHub fallback: public avatar endpoint keyed by the numeric account id.
  if (row.provider === "github" && /^\d+$/.test(row.provider_account_id)) {
    return `https://avatars.githubusercontent.com/u/${row.provider_account_id}?v=4`;
  }
  return null;
}

export async function upsertLinkedAccount(
  userId: string,
  provider: string,
  providerAccountId: string,
  providerEmail: string | null,
  providerPicture: string | null,
): Promise<{ ok: true } | { ok: false; reason: "in-use" }> {
  const db = await getDb();
  const other = await db.get<{ user_id: string }>(
    "SELECT user_id FROM linked_accounts WHERE provider = ? AND provider_account_id = ?",
    provider,
    providerAccountId,
  );
  if (other && other.user_id !== userId) return { ok: false, reason: "in-use" };
  await db.run(
    `INSERT INTO linked_accounts (user_id, provider, provider_account_id, provider_email, provider_picture, created_at)
     VALUES (?,?,?,?,?,?)
     ON CONFLICT(user_id, provider) DO UPDATE SET
       provider_account_id = excluded.provider_account_id,
       provider_email = excluded.provider_email,
       provider_picture = excluded.provider_picture`,
    userId,
    provider,
    providerAccountId,
    providerEmail,
    providerPicture,
    Date.now(),
  );
  return { ok: true };
}

export async function removeLinkedAccount(userId: string, provider: string): Promise<boolean> {
  const res = await (await getDb()).run("DELETE FROM linked_accounts WHERE user_id = ? AND provider = ?", userId, provider);
  return res.changes > 0;
}

// ---------------------------------------------------------------------------
// Link-intent cookie: marks an in-flight "link this provider to MY profile"
// flow. Carries the signed-in local user id so the auth callbacks can record
// the link against the right account instead of matching by email.
// ---------------------------------------------------------------------------

export const LINK_INTENT_COOKIE = "pa.link-intent";

export async function setLinkIntent(userId: string): Promise<void> {
  (await cookies()).set(LINK_INTENT_COOKIE, userId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600, // one OAuth round-trip; short-lived on purpose
  });
}

export async function readLinkIntent(): Promise<string | null> {
  return (await cookies()).get(LINK_INTENT_COOKIE)?.value ?? null;
}

/** Best effort: not callable outside a route handler / server action. */
export async function clearLinkIntent(): Promise<void> {
  try {
    (await cookies()).delete(LINK_INTENT_COOKIE);
  } catch {
    // Read-only cookie context (RSC render) — leave it; it expires in 10 min.
  }
}