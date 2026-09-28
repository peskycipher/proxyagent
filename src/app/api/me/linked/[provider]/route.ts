import { NextResponse } from "next/server";
import { signIn } from "@/auth";
import { requireUser, unauthorized } from "@/lib/route-session";
import { getUserByEmail, verifyPassword } from "@/lib/users";
import { isLinkedProvider, listLinkedAccounts, providerAvailable, removeLinkedAccount, setLinkIntent } from "@/lib/linked-accounts";

type Ctx = { params: Promise<{ provider: string }> };

/**
 * Starts the "link this provider to my profile" flow: sets a short-lived
 * link-intent cookie (consumed by the auth callbacks in src/auth.ts) and
 * redirects into the provider's OAuth round-trip, landing on /chat?linked=1.
 */
export async function POST(_req: Request, { params }: Ctx) {
  const user = await requireUser();
  if (!user) return unauthorized();
  const { provider } = await params;
  if (!isLinkedProvider(provider)) return NextResponse.json({ error: "unknown provider" }, { status: 404 });
  if (!providerAvailable(provider)) return NextResponse.json({ error: "provider not configured" }, { status: 400 });

  await setLinkIntent(user.id);
  // signIn() throws NEXT_REDIRECT in route handlers; Next converts it to the
  // redirect response the browser follows into the OAuth flow.
  await signIn(provider, { redirectTo: "/chat?linked=1" });
  return NextResponse.json({ error: "redirect failed" }, { status: 500 });
}

/**
 * Removes a linked provider identity. Unlinking the LAST remaining sign-in
 * method requires confirming the local password (OAuth-only users carry a
 * throwaway hash that never verifies, so they are always refused) — otherwise
 * the profile could lock itself out.
 */
export async function DELETE(req: Request, { params }: Ctx) {
  const user = await requireUser();
  if (!user) return unauthorized();
  const { provider } = await params;
  if (!isLinkedProvider(provider)) return NextResponse.json({ error: "unknown provider" }, { status: 404 });

  const accounts = await listLinkedAccounts(user.id);
  if (!accounts.some((a) => a.provider === provider)) {
    return NextResponse.json({ error: "not linked" }, { status: 404 });
  }
  const others = accounts.filter((a) => a.provider !== provider);
  if (others.length === 0) {
    const body = (await req.json().catch(() => null)) as { password?: string } | null;
    const password = typeof body?.password === "string" ? body.password : "";
    const account = await getUserByEmail(user.email ?? "");
    if (!password || !account || !verifyPassword(password, account.password_hash)) {
      return NextResponse.json({ error: "password required to unlink your only sign-in method" }, { status: 400 });
    }
  }
  await removeLinkedAccount(user.id, provider);
  return NextResponse.json({ ok: true });
}