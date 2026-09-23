import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getPurchase } from "@/lib/purchases";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const purchase = await getPurchase(id);
  if (!purchase || purchase.user_id !== session.user.id) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json({
    status: purchase.status,
    addressIn: purchase.address_in,
    amountUsdCents: purchase.amount_usd_cents,
    seconds: purchase.seconds,
  });
}
