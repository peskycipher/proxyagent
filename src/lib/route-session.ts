import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { podControl } from "@/lib/pod/control";

/**
 * Auth guard for API route handlers: returns the signed-in local user, or
 * null for anonymous callers (respond with `unauthorized()`).
 */
export async function requireUser(): Promise<{ id: string; email?: string | null } | null> {
  const session = await auth();
  const id = session?.user?.id;
  if (id) {
    // Any authenticated request is user activity: the pod/idle-stop controller
    // only stops the model instance once ALL sessions have been signed out for
    // longer than POD_IDLE_TIMEOUT_SECONDS (with the 5-min sliding logout that
    // means ~10 min after the last user went quiet). Best-effort — podControl
    // swallows every error and degrades to a no-op, so this never blocks the
    // request.
    void podControl().touchActivity();
  }
  return id ? { id, email: session.user.email } : null;
}

/** The 401 response route handlers return when `requireUser()` yields null. */
export function unauthorized(): Response {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}