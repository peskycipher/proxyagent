import { describe, it, expect, afterEach, vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete process.env.LOG_LEVEL;
});

describe("structured logger", () => {
  it("emits structured objects with level, message and fields", async () => {
    const captured: Array<{ level: string; line: Record<string, unknown> | string }> = [];
    const lines = vi.fn((level: string, line: Record<string, unknown> | string) => captured.push({ level, line }));
    // stub the console methods the default sink writes to
    const err = vi.spyOn(console, "error").mockImplementation((data: unknown) => lines("error", data as Record<string, unknown>));
    const log = vi.spyOn(console, "log").mockImplementation((data: unknown) => lines("info", data as Record<string, unknown>));

    const { logger, configureLogger } = await import("@/lib/logger");
    logger.error("lock lost mid-stream", { userId: "u1" });
    expect(err).toHaveBeenCalledTimes(1);
    // The default sink logs a plain object (not a JSON string): Cloudflare
    // Workers Logs extracts object keys as structured attributes, which the
    // logs OTLP export delivers to Honeycomb as queryable columns.
    const parsed = captured[0].line as Record<string, unknown>;
    expect(parsed.level).toBe("error");
    expect(parsed.message).toBe("lock lost mid-stream");
    expect(parsed.userId).toBe("u1");
    expect(typeof parsed.ts).toBe("string");

    // info goes through the non-error console path
    logger.info("pod stopped");
    expect((captured[1].line as Record<string, unknown>).level).toBe("info");
    expect(log).toHaveBeenCalled();
    void configureLogger;
  });

  it("filters by LOG_LEVEL and honors a custom alerting sink", async () => {
    vi.resetModules();
    process.env.LOG_LEVEL = "warn";
    const seen: Array<{ level: string; message: string }> = [];
    const { logger, configureLogger } = await import("@/lib/logger");
    configureLogger({
      sink: (level, message) => {
        seen.push({ level, message });
      },
    });

    logger.debug("noise"); // below warn — dropped
    logger.info("noise"); // dropped
    logger.warn("slow upstream", { ms: 5000 });
    logger.error("webhook signature verification failed", { invoiceId: "pur_x" });

    expect(seen).toEqual([
      { level: "warn", message: "slow upstream" },
      { level: "error", message: "webhook signature verification failed" },
    ]);
  });

  it("never throws out of a broken sink", async () => {
    vi.resetModules();
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const { logger, configureLogger } = await import("@/lib/logger");
    configureLogger({
      sink: () => {
        throw new Error("sink exploded");
      },
    });
    expect(() => logger.error("still delivered")).not.toThrow();
    // fallback path logs the event without fields
    expect(err).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(err.mock.calls[0][0])).message).toBe("still delivered");
  });
});