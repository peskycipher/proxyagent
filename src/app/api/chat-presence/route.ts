import { NextResponse } from "next/server";
import { requireUser, unauthorized } from "@/lib/route-session";
import { openTick } from "@/lib/chat-presence";

/**
 * Chat page presence heartbeat. The client POSTs every ~10s while /chat is
 * open; each call bills elapsed wall-clock seconds from users.open_billed_at
 * (server clock) and returns the live balance. A spent balance answers 402,
 * which the client treats as "redirect to /portal and stop heartbeating".
 */
export async function POST() {
  const user = await requireUser();
  if (!user) return unauthorized();
  const userId = user.id;

  try {
    const balanceSeconds = await openTick(userId, Date.now());
    return NextResponse.json({ balanceSeconds });
  } catch (err) {
    if (err instanceof Error && /insufficient/i.test(err.message)) {
      return NextResponse.json({ balanceSeconds: 0 }, { status: 402 });
    }
    throw err;
  }
}