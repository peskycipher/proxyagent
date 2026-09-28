import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      /** Local user id (stamped by the jwt callback). */
      id?: string;
      /** OAuth identity carried from sign-in for linked-account self-healing. */
      oauthProvider?: string;
      oauthAccountId?: string;
      oauthPicture?: string | null;
    };
  }
}