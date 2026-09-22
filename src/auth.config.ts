import type { NextAuthConfig } from "next-auth";

/**
 * DB-free base config — safe to import from edge middleware.
 * The credentials provider (which touches SQLite) is added in src/auth.ts.
 */
export const authConfig = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login", error: "/login" },
  callbacks: {
    jwt({ token, user }) {
      if (user) token.uid = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.uid) {
        session.user = { ...session.user, id: token.uid as string };
      }
      return session;
    },
  },
  providers: [],
} satisfies NextAuthConfig;