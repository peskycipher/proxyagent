import { NextResponse } from "next/server";
import { requireUser, unauthorized } from "@/lib/route-session";
import { setUsername } from "@/lib/users";

/** Username rules: 2–32 chars, letters/digits/underscore/hyphen. */
const USERNAME_RE = /^[A-Za-z0-9_-]{2,32}$/;

/** Sets (or clears, with an empty string) the caller's public username. */
export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return unauthorized();

  const body = (await req.json().catch(() => null)) as { username?: string } | null;
  const username = typeof body?.username === "string" ? body.username.trim() : "";
  if (username && !USERNAME_RE.test(username)) {
    return NextResponse.json({ error: "2–32 characters; letters, digits, - and _ only" }, { status: 400 });
  }

  const res = await setUsername(user.id, username);
  if (!res.ok) return NextResponse.json({ error: "that username is taken" }, { status: 409 });
  return NextResponse.json({ ok: true, username: username || null });
}