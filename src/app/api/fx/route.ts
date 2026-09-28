import { NextResponse } from "next/server";
import { requireUser, unauthorized } from "@/lib/route-session";
import { convertFiat, FIAT_CURRENCIES } from "@/lib/gateway";

const ALLOWED = new Set<string>(FIAT_CURRENCIES);

/**
 * USD -> FIAT conversion for the portal price display, backed by CryptAPI's
 * global convert endpoint. Session-gated (portal-only usage) and tightly
 * validated so it can't be abused as an open conversion proxy.
 * GET /api/fx?amount=1&to=EUR -> { value: 0.92 }
 */
export async function GET(req: Request) {
  const user = await requireUser();
  if (!user) return unauthorized();

  let url: URL;
  try {
    url = new URL(req.url);
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  const to = (url.searchParams.get("to") ?? "").toUpperCase();
  const amount = Number(url.searchParams.get("amount"));

  if (!ALLOWED.has(to)) return NextResponse.json({ error: "unsupported currency" }, { status: 400 });
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000) {
    return NextResponse.json({ error: "invalid amount" }, { status: 400 });
  }

  const value = await convertFiat(amount, to);
  if (value === null) return NextResponse.json({ error: "conversion unavailable" }, { status: 502 });
  return NextResponse.json({ value });
}