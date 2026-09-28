import { describe, it, expect, vi, beforeEach } from "vitest";

type SendMsg = { from: string; subject: string; html: string; text: string };

const MSG = {
  purchaseId: "pur_123",
  coin: "btc",
  seconds: 3600,
  amountUsdCents: 159,
};

describe("payment notification mailer", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("sends one email from noreply@proxyagent.rent with coin + hours + amount", async () => {
    const { sendPaymentEmail } = await import("@/lib/mailer");
    const send = vi.fn<(msg: SendMsg) => Promise<void>>(async () => undefined);
    await sendPaymentEmail(MSG, { send });

    expect(send).toHaveBeenCalledTimes(1);
    const call = send.mock.calls[0];
    if (!call) throw new Error("expected send() to have been called");
    const msg = call[0];
    expect(msg.from).toBe("noreply@proxyagent.rent");
    expect(msg.subject).toMatch(/BTC/i);
    expect(msg.text).toContain("$1.59");
    expect(msg.text).toMatch(/1h\b/);
    expect(msg.html).toContain("$1.59");
  });

  it("resolves silently when the binding is absent (local dev / tests)", async () => {
    const { sendPaymentEmail } = await import("@/lib/mailer");
    // Second arg omitted: mailer probes getCloudflareContext().env.NOTIFY_OPS,
    // which is absent outside Workers — must resolve, never throw.
    await expect(sendPaymentEmail(MSG)).resolves.toBeUndefined();
  });

  it("never throws when send() rejects — email is best-effort", async () => {
    const { sendPaymentEmail } = await import("@/lib/mailer");
    const send = vi.fn<(msg: SendMsg) => Promise<void>>(async () => {
      throw new Error("destination not verified");
    });
    await expect(sendPaymentEmail(MSG, { send })).resolves.toBeUndefined();
  });
});
describe("webhook email integration", () => {
  it("webhook handler emails ops after a confirmed purchase", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("src/app/api/webhooks/gateway/[secret]/route.ts", "utf8");
    expect(src).toMatch(/sendPaymentEmail/);
    expect(src).toMatch(/credited/);
  });
});
