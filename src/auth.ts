import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import GitHub from "next-auth/providers/github";
import { authConfig } from "@/auth.config";
import { getUserByEmail, verifyPassword, upsertUserByEmail } from "@/lib/users";
import { oauthVerifiedEmail } from "@/lib/oauth";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      authorize: async (creds) => {
        const email = typeof creds?.email === "string" ? creds.email : "";
        const password = typeof creds?.password === "string" ? creds.password : "";
        if (!email || !password) return null;
        const user = await getUserByEmail(email);
        if (!user || !verifyPassword(password, user.password_hash)) return null;
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
    // JWT strategy: stamp the LOCAL user id onto the token. Credentials
    // users already carry their db id; OAuth users are linked or created
    // by VERIFIED email only (see oauthVerifiedEmail) — an unverified
    // provider email aborts the sign-in instead of linking, so an
    // attacker-controlled provider account cannot take over a local
    // account by claiming its email address.
    async jwt({ token, user, account, profile }) {
      if (user) {
        if (typeof user.id === "string" && user.id.startsWith("usr_")) {
          token.uid = user.id;
        } else if (user.email) {
          const verified = await oauthVerifiedEmail(account, user, profile);
          if (!verified) throw new Error("OAuthEmailNotVerified");
          const localId = await upsertUserByEmail(verified);
          if (localId) token.uid = localId;
        }
      }
      return token;
    },
  },
});