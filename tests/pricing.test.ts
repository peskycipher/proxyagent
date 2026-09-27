import { describe, it, expect } from "vitest";
import { PRICE_PER_HOUR_USD, TIERS, priceUsdCents, secondsForBlock, tierFor } from "@/lib/pricing";

describe("pricing", () => {
  it("prices the four tiers exactly, in cents", () => {
    // 12h @ 100% => $19.08
    expect(priceUsdCents(12)).toBe(1908);
    // 24h @ 95% => $36.25 (half-up)
    expect(priceUsdCents(24)).toBe(3625);
    // 72h @ 90% => $103.03 (half-up)
    expect(priceUsdCents(72)).toBe(10303);
    // 120h @ 85% => $162.18
    expect(priceUsdCents(120)).toBe(16218);
  });

  it("converts blocks to seconds", () => {
    expect(secondsForBlock(12)).toBe(43200);
    expect(secondsForBlock(120)).toBe(432000);
  });

  it("exposes the documented tiers", () => {
    expect(PRICE_PER_HOUR_USD).toBe(1.59);
    expect(TIERS.map((t) => t.hours)).toEqual([12, 24, 72, 120]);
    expect(TIERS.map((t) => t.discount)).toEqual([0, 0.05, 0.1, 0.15]);
    for (const t of TIERS) expect(tierFor(t.hours)).toBe(t);
  });

  it("rejects unknown block sizes", () => {
    expect(() => priceUsdCents(10)).toThrow();
    expect(() => priceUsdCents(0)).toThrow();
    expect(() => priceUsdCents(-3)).toThrow();
  });
});
