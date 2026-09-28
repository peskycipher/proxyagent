import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getDb } from "@/lib/db";
import { availableProviders, isLinkedProvider, listLinkedAccounts, upsertLinkedAccount } from "@/lib/linked-accounts";

/** Lists the caller's linked OAuth identities and which providers are configured. */
export async function GET() {
  const session = await auth();
  const user = session?.user;
  if (!user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let accounts = await listLinkedAccounts(user.id);
  // Self-heal legacy sessions: identities minted before the linked-accounts
  // feature carry the provider on the token but never got a row — write it;
  // rows created before picture capture (or by an earlier self-heal from a
  // pictureless token) get their picture backfilled the same way.
  const oauth = user as { oauthProvider?: string; oauthAccountId?: string; oauthPicture?: string | null };
  if (oauth.oauthProvider && oauth.oauthAccountId && isLinkedProvider(oauth.oauthProvider)) {
    const existing = accounts.find((a) => a.provider === oauth.oauthProvider);
    if (!existing) {
      await upsertLinkedAccount(user.id, oauth.oauthProvider, oauth.oauthAccountId, user.email ?? null, oauth.oauthPicture ?? null);
      accounts = await listLinkedAccounts(user.id);
    } else if (!existing.provider_picture && oauth.oauthPicture) {
      // Backfill just the picture; do not touch the stored email/account id.
      await (await getDb()).run(
        "UPDATE linked_accounts SET provider_picture = ? WHERE user_id = ? AND provider = ?",
        oauth.oauthPicture,
        user.id,
        oauth.oauthProvider,
      );
      accounts = await listLinkedAccounts(user.id);
    }
  }
  return NextResponse.json({
    accounts: accounts.map((a) => ({ provider: a.provider, email: a.provider_email, picture: a.provider_picture, linkedAt: a.created_at })),
    available: availableProviders(),
  });
}