// Pricing for prepaid time-credit blocks.
// Base rate = 2x the Runpod pod cost ($0.53/h), i.e. $1.06/h.

export const PRICE_PER_HOUR_USD = 1.06;

export interface Tier {
  hours: number;
  discount: number; // fraction, 0..0.15
}

export const TIERS: readonly Tier[] = [
  { hours: 1, discount: 0 },
  { hours: 3, discount: 0.05 },
  { hours: 6, discount: 0.1 },
  { hours: 12, discount: 0.15 },
];

function tierFor(hours: number): Tier {
  const tier = TIERS.find((t) => t.hours === hours);
  if (!tier) {
    throw new Error(`Unknown block size: ${hours}h`);
  }
  return tier;
}

/** Price of a block in whole USD cents (rounded half-up, no float drift). */
export function priceUsdCents(hours: number): number {
  const tier = tierFor(hours);
  // Use exact integer math: 1.06 USD = 106 cents.
  const baseCents = Math.round(PRICE_PER_HOUR_USD * 100) * hours;
  const discountBp = Math.round(tier.discount * 10000); // basis points
  const net = baseCents * (10000 - discountBp);
  // Round half-up on the scaled value.
  return Math.floor((net + 5000) / 10000);
}

/** Seconds of model time in a block. */
export function secondsForBlock(hours: number): number {
  tierFor(hours); // validates
  return hours * 3600;
}

export { tierFor };
