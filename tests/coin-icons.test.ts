import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { iconFor } from "@/lib/coin-icons";
import { iconUrl } from "@/lib/icon-url";

const COINS = ["btc", "zec", "ltc", "eth", "doge", "xmr", "sol", "trc20_usdt"];
const addedKeys: string[] = [];

// Simulate the operator configuring each coin via CRYPTAPI_WALLETS_<TICKER>
beforeAll(() => {
  for (const c of COINS) {
    const key = `CRYPTAPI_WALLETS_${c.toUpperCase()}`;
    if (process.env[key] === undefined) addedKeys.push(key);
    process.env[key] = process.env[key] || "x";
  }
});

afterAll(() => {
  for (const k of addedKeys) delete process.env[k];
});

describe("coin-icons coverage", () => {
  it("every env-accepted coin resolves to a non-empty icon URL", () => {
    for (const c of COINS) {
      const icon = iconFor(c);
      expect(icon, `no icon registered for accepted coin "${c}"`).toBeDefined();
      expect(iconUrl(icon!), `empty URL for "${c}"`).not.toBe("");
    }
  });

  it("network-qualified trc20_usdt uses its TRON-red override, not the base usdt icon", () => {
    expect(iconFor("trc20_usdt")).toBeDefined();
    expect(iconFor("trc20_usdt")).not.toBe(iconFor("usdt"));
    expect(iconUrl(iconFor("trc20_usdt")!)).toContain("EB0029");
  });

  it("unknown coin yields undefined (caller falls back to letter)", () => {
    expect(iconFor("not_a_coin")).toBeUndefined();
  });
});