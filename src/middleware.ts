import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

const { auth: middleware } = NextAuth(authConfig);

export default middleware((req) => {
  const loggedIn = !!req.auth?.user;
  const p = req.nextUrl.pathname;
  if (!loggedIn) {
    if (p.startsWith("/api/")) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", p);
    return Response.redirect(url);
  }
});

export const config = {
  matcher: ["/chat/:path*", "/portal/:path*", "/api/chat/:path*", "/api/purchases/:path*", "/api/chats/:path*", "/api/me/:path*"],
};