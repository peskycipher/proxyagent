import type { NextAuthConfig } from "next-auth";

/**
 * DB-free base config — safe to import from edge middleware.
 * The credentials provider (which touches SQLite) is added in src/auth.ts.
 */
export const authConfig = {
  // Self-hosted behind reverse proxies/tunnels: trust the configured host.
  trustHost: true,
  session: {
    strategy: "jwt",
    // Sliding 5-minute session (auto-logout on inactivity): with the JWT
    // strategy Auth.js re-issues the token (exp = now + maxAge) on every
    // authenticated request — page load, API call, presence heartbeat — so
    // activity keeps the session alive and >5 min of idleness expires it.
    // (updateAge is effectively ignored for JWT — next-auth#13248 — but its
    // every-request re-issue is exactly the sliding-window we want.)
    maxAge: 5 * 60,
  },
  pages: { signIn: "/login", error: "/login" },
  callbacks: {
    jwt({ token, user }) {
      if (user) token.uid = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.uid) {
        // OAuth identity fields carried from sign-in for linked-account
        // self-healing (see GET /api/me/linked). Spread separately: the
        // Session.user type in callback position is the @auth/core
        // AdapterUser intersection, which the module augmentation doesn't
        // reach — the spread bypasses the excess-property check.
        const oauthIdentity = {
          oauthProvider: token.oauthProvider as string | undefined,
          oauthAccountId: token.oauthAccountId as string | undefined,
          oauthPicture: (token.oauthPicture as string | null | undefined) ?? undefined,
        };
        session.user = { ...session.user, id: token.uid as string, ...oauthIdentity };
      }
      return session;
    },
  },
  providers: [],
} satisfies NextAuthConfig;
