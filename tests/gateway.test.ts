import { describe, it, expect, beforeEach, afterEach } from "vitest";

const WALLETS = ["CRYPTAPI_WALLETS_BTC", "CRYPTAPI_WALLETS_TRC20_USDT"];

describe("coin id -> CryptAPI ticker mapping", () => {
  let gateway: typeof import("@/lib/gateway");

  beforeEach(async () => {
    process.env.CRYPTAPI_WALLETS_BTC = "bc1qxtest";
    process.env.CRYPTAPI_WALLETS_TRC20_USDT = "TXtest";
    gateway = await import("@/lib/gateway");
  });

  afterEach(() => {
    for (const k of WALLETS) delete process.env[k];
  });

  it("maps network-qualified coin ids to CryptAPI ticker paths", () => {
    expect(gateway.tickerFor("trc20_usdt")).toBe("trc20/usdt");
    expect(gateway.tickerFor("btc")).toBe("btc");
    expect(gateway.tickerFor("zec")).toBe("zec");
  });

  it("maps Solana to its network/token form (bare sol 404s on /create/)", () => {
    expect(gateway.tickerFor("sol")).toBe("sol/sol");
  });

  it("accepts and resolves payout wallets for network-qualified coins", () => {
    expect(gateway.acceptedCoins().sort()).toEqual(["btc", "trc20_usdt"]);
    expect(gateway.payoutWalletFor("trc20_usdt")).toBe("TXtest");
    expect(gateway.payoutWalletFor("btc")).toBe("bc1qxtest");
    expect(gateway.payoutWalletFor("sol")).toBeUndefined();
  });
});