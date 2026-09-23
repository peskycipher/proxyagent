import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getUserById } from "@/lib/users";
import { balanceSeconds } from "@/lib/credits";
import { acceptedCoins } from "@/lib/gateway";
import { TIERS, priceUsdCents } from "@/lib/pricing";
import { listPurchases } from "@/lib/purchases";
import PortalClient from "./portal-client";

export const dynamic = "force-dynamic";

export default async function Portal() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login?next=/portal");
  const user = (await getUserById(session.user.id))!;
  const purchases = await listPurchases(user.id);

  return (
    <PortalClient
      email={user.email}
      balanceSeconds={await balanceSeconds(user.id)}
      tiers={TIERS.map((t) => ({ hours: t.hours, discount: t.discount, cents: priceUsdCents(t.hours) }))}
      coins={acceptedCoins()}
      purchases={purchases.map((p) => ({
        id: p.id,
        coin: p.coin,
        seconds: p.seconds,
        amountUsdCents: p.amount_usd_cents,
        status: p.status,
      }))}
    />
  );
}