/**
 * Validate a client-supplied "next" redirect target: path-form only.
 *
 * An absolute URL ("https://evil.com") or a protocol-relative one
 * ("//evil.com") would send the just-authenticated user to another origin —
 * the same rule the auth.ts signIn callback already applies to the
 * callback-url cookie. Anything else falls back to the default destination.
 */
export function pathOnlyNext(raw: string | null | undefined, fallback: string): string {
  return typeof raw === "string" && raw.startsWith("/") && !raw.startsWith("//") ? raw : fallback;
}