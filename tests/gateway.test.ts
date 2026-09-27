import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

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

  it("convertUsdToCoin parses string value_coin and returns null on failure", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: "success", value_coin: "0.00003603" }), { status: 200 }))
      .mockResolvedValueOnce(new Response("{\"status\":\"error\"}", { status: 400 }))
      .mockRejectedValueOnce(new Error("network down"));
    vi.stubGlobal("fetch", fetchMock);
    try {
      expect(await gateway.convertUsdToCoin("btc", 3.02)).toBeCloseTo(0.00003603, 10);
      expect(await gateway.convertUsdToCoin("btc", 3.02)).toBeNull();
      expect(await gateway.convertUsdToCoin("btc", 3.02)).toBeNull();
      expect(await gateway.convertUsdToCoin("btc", 0)).toBeNull(); // invalid input, no fetch
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(fetchMock.mock.calls[0][0]).toContain("/btc/convert/?value=3.02&from=USD");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("usdCentsFromConvertJson parses USD values and rejects junk", () => {
    expect(gateway.usdCentsFromConvertJson('{"USD": "3.20"}')).toBe(320);
    expect(gateway.usdCentsFromConvertJson('{"USD": 15.90, "EUR": "14.60"}')).toBe(1590);
    expect(gateway.usdCentsFromConvertJson('{"EUR": "14.60"}')).toBeNull();
    expect(gateway.usdCentsFromConvertJson("not json")).toBeNull();
    expect(gateway.usdCentsFromConvertJson(null)).toBeNull();
  });

  it("getGatewayLogs returns parsed callbacks and null on failure", async () => {
    const good = {
      status: "success",
      callbacks: [
        {
          txid_in: "tx1",
          result: "sent",
          value_coin: 0.01,
          logs: [{ request_url: "https://site.example/cb?uuid=u1&pending=0" }],
        },
        { result: "pending", value_coin: 0.02 },
      ],
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(good), { status: 200 }))
      .mockResolvedValueOnce(new Response("error", { status: 500 }))
      .mockRejectedValueOnce(new Error("network down"));
    vi.stubGlobal("fetch", fetchMock);
    try {
      const logs = await gateway.getGatewayLogs("btc", "https://site.example/cb");
      expect(logs).toHaveLength(2);
      expect(logs![0]).toEqual({
        txidIn: "tx1",
        result: "sent",
        valueCoin: 0.01,
        requestUrl: "https://site.example/cb?uuid=u1&pending=0",
      });
      expect(logs![1].requestUrl).toBeNull();
      expect(await gateway.getGatewayLogs("btc", "https://site.example/cb")).toBeNull();
      expect(await gateway.getGatewayLogs("btc", "https://site.example/cb")).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});