import { redirect } from "next/navigation";
import { auth } from "@/auth";
import ChatClient from "./chat-client";
import { acceptedCoins } from "@/lib/gateway";
import { TIERS, priceUsdCents } from "@/lib/pricing";

export const dynamic = "force-dynamic";

export default async function Chat() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login?next=/chat");
  return (
    <ChatClient
      userEmail={session.user.email ?? ""}
      tiers={TIERS.map((t) => ({ hours: t.hours, discount: t.discount, cents: priceUsdCents(t.hours) }))}
      coins={acceptedCoins()}
    />
  );
}