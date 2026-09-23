import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getUserById } from "@/lib/users";
import { balanceSeconds } from "@/lib/credits";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const user = await getUserById(session.user.id);
  if (!user) return NextResponse.json({ error: "user not found" }, { status: 404 });
  return NextResponse.json({ email: user.email, balanceSeconds: await balanceSeconds(user.id) });
}
