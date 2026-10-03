import NextAuth from "next-auth";
import { cookies } from "next/headers";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import GitHub from "next-auth/providers/github";
import { authConfig } from "@/auth.config";
import { getUserByEmail, verifyPassword, upsertUserByEmail } from "@/lib/users";
import { OAuthEmailNotVerifiedError, oauthSignInDecision, oauthVerifiedEmail } from "@/lib/oauth";
import { clearLinkIntent, providerPictureFromProfile, readLinkIntent, upsertLinkedAccount } from "@/lib/linked-accounts";
import { turnstileErrorMessage, verifyTurnstileToken } from "@/lib/turnstile";
import { track } from "@/lib/telemetry";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { email: {}, password: {}, turnstileToken: {} },
      authorize: async (creds) => {
        const email = typeof creds?.email === "string" ? creds.email : "";
        const password = typeof creds?.password === "string" ? creds.password : "";
        if (!email || !password) return null;
        // The credentials callback serves both the login page ("login") and
        // the signup page's auto-login ("signup"). Tokens are single-use at
        // siteverify, so the single call checks success + hostname + action
        // against the allowed set.
        const captcha = await verifyTurnstileToken(
          typeof creds?.turnstileToken === "string" ? creds.turnstileToken : undefined,
          ["login", "signup"],
        );
        if (!captcha.ok) {
          track("login.failed", { "app.login.reason": "captcha_failed" });
          throw new Error(turnstileErrorMessage(captcha));
        }
        const user = await getUserByEmail(email);
        if (!user || !verifyPassword(password, user.password_hash)) {
          track("login.failed", { "app.login.reason": "bad_credentials" });
          return null;
        }
        track("login.success", { "app.user.id": user.id });
        return { id: user.id, email: user.email };
      },
    }),
    // SSO: enabled only when their env keys are set (login form matches).
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? [Google({ clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET })]
      : []),
    ...(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET
      ? [GitHub({ clientId: process.env.GITHUB_CLIENT_ID, clientSecret: process.env.GITHUB_CLIENT_SECRET })]
      : []),
  ],
  callbacks: {
    ...authConfig.callbacks,
    // Runs BEFORE the jwt callback: refuse an unverified provider email with a
    // distinct, user-visible error code (/login?error=OAuthEmailNotVerified)
    // instead of an anonymous failure. No linking has happened at this point.
    async signIn({ user, account, profile }) {
      // Explicit "link this provider to MY profile" flow (started from the
      // chat profile settings): the link-intent cookie carries the signed-in
      // local user id. Gate on a verified provider email — the same rule as
      // sign-in linking — then record the identity directly against that user.
      // On success return true (the session keeps its uid; the signIn()
      // redirectTo lands the user on /chat?linked=1). On failure redirect back
      // with a reason the UI can show.
      const intent = await readLinkIntent();
      if (intent && account && account.type !== "credentials") {
        await clearLinkIntent(); // consume it either way
        if (!/^usr_/.test(intent)) return "/chat?linked=error&reason=session";
        const verified = await oauthVerifiedEmail(account, user, profile);
        if (!verified) return "/chat?linked=error&reason=unverified";
        const linked = await upsertLinkedAccount(intent, account.provider, String(account.providerAccountId), verified, providerPictureFromProfile(profile));
        if (!linked.ok) return "/chat?linked=error&reason=in-use";
        return true;
      }
      const decision = await oauthSignInDecision(account, user, profile);
      if (decision.allow) return true;
      // The deep link survives the deny inside Auth.js's callback-url cookie —
      // re-attach it so a repaired verification retries into the original
      // destination instead of falling back to /portal. Path-form only: no
      // open redirects via absolute URLs or protocol-relative ones.
      let next: string | undefined;
      try {
        const jar = await cookies();
        const raw =
          jar.get("__Secure-authjs.callback-url")?.value ??
          jar.get("authjs.callback-url")?.value;
        if (raw?.startsWith("/") && !raw.startsWith("//")) next = raw;
      } catch {
        // No request context to read cookies from — the deny still redirects,
        // just without the preserved destination.
      }
      const params = new URLSearchParams({ error: "OAuthEmailNotVerified" });
      if (next) params.set("next", next);
      return `/login?${params.toString()}`;
    },
    // JWT strategy: stamp the LOCAL user id onto the token. Credentials
    // users already carry their db id; OAuth users are linked or created
    // by VERIFIED email only (see oauthVerifiedEmail) — an unverified
    // provider email aborts the sign-in instead of linking, so an
    // attacker-controlled provider account cannot take over a local
    // account by claiming its email address. (Backstop: the signIn
    // callback already refuses these; this throws a named error so any
    // bypass attempt is identifiable in logs.)
    async jwt({ token, user, account, profile }) {
      if (user) {
        // Link flow: the signIn callback already recorded the identity against
        // the cookie's user; keep the session identity instead of re-matching
        // by provider email (which could point the token at another account).
        let linkIntent: string | null = null;
        try {
          linkIntent = await readLinkIntent();
        } catch {
          linkIntent = null;
        }
        if (linkIntent && typeof token.uid === "string") return token;
        if (typeof user.id === "string" && user.id.startsWith("usr_")) {
          token.uid = user.id;
        } else if (user.email) {
          const verified = await oauthVerifiedEmail(account, user, profile);
          if (!verified) throw new OAuthEmailNotVerifiedError();
          const localId = await upsertUserByEmail(verified);
          if (localId) token.uid = localId;
        }
        // Bookkeeping: ordinary OAuth sign-ins refresh the stored provider
        // identity for the local user this token resolved to (the explicit
        // link flow wrote its row in the signIn callback).
        if (
          account &&
          account.type !== "credentials" &&
          account.provider &&
          account.providerAccountId &&
          typeof token.uid === "string"
        ) {
          // Persist the identity on the token so sessions can self-heal a
          // missing linked_accounts row later (see GET /api/me/linked).
          token.oauthProvider = account.provider;
          token.oauthAccountId = String(account.providerAccountId);
          token.oauthPicture = providerPictureFromProfile(profile);
          try {
            await upsertLinkedAccount(
              token.uid,
              account.provider,
              String(account.providerAccountId),
              (await oauthVerifiedEmail(account, user, profile)) ?? user.email ?? null,
              providerPictureFromProfile(profile),
            );
          } catch {
            // Best effort — sign-in must not fail on link bookkeeping.
          }
        }
      }
      return token;
    },
  },
});
