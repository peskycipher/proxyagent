import { NextResponse } from "next/server";
import { requireUser, unauthorized } from "@/lib/route-session";
import { clearUserAvatar, setUserAvatar } from "@/lib/users";

/** Accepts a small client-resized image data URL (≤ ~128px, JPEG/PNG/WebP). */
const MAX_DATA_URL_LENGTH = 200_000;
const DATA_URL_RE = /^data:image\/(?:png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/;

export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return unauthorized();

  const body = (await req.json().catch(() => null)) as { dataUrl?: string } | null;
  const dataUrl = typeof body?.dataUrl === "string" ? body.dataUrl : "";
  if (dataUrl.length > MAX_DATA_URL_LENGTH || !DATA_URL_RE.test(dataUrl)) {
    return NextResponse.json({ error: "invalid image" }, { status: 400 });
  }

  await setUserAvatar(user.id, dataUrl);
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const user = await requireUser();
  if (!user) return unauthorized();
  await clearUserAvatar(user.id);
  return NextResponse.json({ ok: true });
}