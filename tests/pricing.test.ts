import { describe, it, expect } from "vitest";
import { PRICE_PER_HOUR_USD, TIERS, priceUsdCents, secondsForBlock, tierFor } from "@/lib/pricing";

describe("pricing", () => {
  it("prices the four tiers exactly, in cents", () => {
    // 1h @ 100% => $1.06
    expect(priceUsdCents(1)).toBe(106);
    // 3h @ 95% => $3.021 -> $3.02
    expect(priceUsdCents(3)).toBe(302);
    // 6h @ 90% => $5.724 -> $5.72
    expect(priceUsdCents(6)).toBe(572);
    // 12h @ 85% => $10.812 -> $10.81
    expect(priceUsdCents(12)).toBe(1081);
  });

  it("converts blocks to seconds", () => {
    expect(secondsForBlock(1)).toBe(3600);
    expect(secondsForBlock(12)).toBe(43200);
  });

  it("exposes the documented tiers", () => {
    expect(PRICE_PER_HOUR_USD).toBe(1.06);
    expect(TIERS.map((t) => t.hours)).toEqual([1, 3, 6, 12]);
    expect(TIERS.map((t) => t.discount)).toEqual([0, 0.05, 0.1, 0.15]);
    for (const t of TIERS) expect(tierFor(t.hours)).toBe(t);
  });

  it("rejects unknown block sizes", () => {
    expect(() => priceUsdCents(2)).toThrow();
    expect(() => priceUsdCents(0)).toThrow();
    expect(() => priceUsdCents(-3)).toThrow();
  });
});
