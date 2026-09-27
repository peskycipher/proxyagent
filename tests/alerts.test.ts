import { describe, it, expect, afterEach, vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete process.env.ALERT_WEBHOOK_URL;
  delete process.env.ALERT_MIN_LEVEL;
  delete process.env.ALERTS_PER_MINUTE;
});

describe("webhook alerting sink", () => {
  it("posts warn+error events as JSON while console logging continues", async () => {
    process.env.ALERT_WEBHOOK_URL = "https://alerts.example/hook";
    const fetchMock = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { installAlertSink } = await import("@/lib/alerts");
    const { logger } = await import("@/lib/logger");
    installAlertSink();

    const consoleErr = vi.spyOn(console, "error").mockImplementation(() => {});
    logger.warn("chat lock renew failed", { userId: "u1" });
    logger.error("createCharge failed", { error: "boom" });
    logger.info("should not alert");

    // let the fire-and-forget POSTs flush
    await new Promise((r) => setTimeout(r, 0));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const first = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(first.level).toBe("warn");
    expect(first.message).toBe("chat lock renew failed");
    expect(first.userId).toBe("u1");
    expect(typeof first.ts).toBe("string");
    // console JSON line also emitted (additive sink)
    expect(consoleErr).toHaveBeenCalledTimes(2);
  });

  it("respects ALERT_MIN_LEVEL and rate caps with a visible drop notice", async () => {
    vi.resetModules();
    process.env.ALERT_WEBHOOK_URL = "https://alerts.example/hook";
    process.env.ALERT_MIN_LEVEL = "error";
    process.env.ALERTS_PER_MINUTE = "2";
    const fetchMock = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { installAlertSink } = await import("@/lib/alerts");
    const { logger } = await import("@/lib/logger");
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
    installAlertSink();

    logger.warn("dropped: below min level");
    logger.error("alert 1");
    logger.error("alert 2");
    logger.error("alert 3"); // capped
    logger.error("alert 4"); // capped

    await new Promise((r) => setTimeout(r, 0));
    // 2 in-cap POSTs + 1 drop-notice POST (drops ≥ 20 trigger only every 20th)
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const bodies = fetchMock.mock.calls.map((c) => JSON.parse(String(c[1]?.body)));
    expect(bodies[0].message).toBe("alert 1");
    expect(bodies[1].message).toBe("alert 2");
    expect(bodies[2].message).toContain("alert rate cap hit");
    expect(bodies[2].message).toContain("1 events dropped");
  });

  it("delivery failure never throws and resolves false", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network down")),
    );
    const { sendAlert } = await import("@/lib/alerts");
    await expect(
      sendAlert("https://alerts.example/hook", { ts: "t", level: "error", message: "m" }),
    ).resolves.toBe(false);
  });
});