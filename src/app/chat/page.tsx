import { redirect } from "next/navigation";
import { auth } from "@/auth";
import ChatClient from "./chat-client";
import { acceptedCoins } from "@/lib/gateway";
import { warmModelOnChatLanding } from "@/lib/inference";
import { TIERS, priceUsdCents } from "@/lib/pricing";

export const dynamic = "force-dynamic";

export default async function Chat() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login?next=/chat");
  // Pre-warm the model backend so the first chat message doesn't pay the
  // cold start. Fire-and-forget (see warmModelOnChatLanding) — the render
  // must not block or fail on pod control.
  warmModelOnChatLanding();
  return (
    <ChatClient
      userEmail={session.user.email ?? ""}
      tiers={TIERS.map((t) => ({ hours: t.hours, discount: t.discount, cents: priceUsdCents(t.hours) }))}
      coins={acceptedCoins()}
    />
  );
}