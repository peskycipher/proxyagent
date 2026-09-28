import { NextResponse } from "next/server";
import { requireUser, unauthorized } from "@/lib/route-session";
import { getUserById } from "@/lib/users";
import { linkedAvatarFor } from "@/lib/linked-accounts";
import { balanceSeconds } from "@/lib/credits";

export async function GET() {
  const sessionUser = await requireUser();
  if (!sessionUser) return unauthorized();
  const user = await getUserById(sessionUser.id);
  if (!user) return NextResponse.json({ error: "user not found" }, { status: 404 });
  return NextResponse.json({
    email: user.email,
    balanceSeconds: await balanceSeconds(user.id),
    avatar: user.avatar,
    username: user.username,
    // Uploaded picture wins; linked-provider picture is the fallback.
    linkedAvatar: user.avatar ? null : await linkedAvatarFor(user.id),
  });
}
