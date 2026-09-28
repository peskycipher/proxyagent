import { NextResponse } from "next/server";
import { auth } from "@/auth";

/**
 * Auth guard for API route handlers: returns the signed-in local user, or
 * null for anonymous callers (respond with `unauthorized()`).
 */
export async function requireUser(): Promise<{ id: string; email?: string | null } | null> {
  const session = await auth();
  const id = session?.user?.id;
  return id ? { id, email: session.user.email } : null;
}

/** The 401 response route handlers return when `requireUser()` yields null. */
export function unauthorized(): Response {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}