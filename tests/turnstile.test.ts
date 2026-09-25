import { describe, it, expect, afterEach, vi } from "vitest";
import { verifyTurnstileToken } from "@/lib/turnstile";

const SECRET = "test-secret";
const HOSTNAMES = "proxyagent.rent";

function siteverifyResponse(overrides: Record<string, unknown> = {}, status = 200) {
  return new Response(
    JSON.stringify({ success: true, action: "login", hostname: "proxyagent.rent", ...overrides }),
    { status },
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.TURNSTILE_SECRET;
  delete process.env.TURNSTILE_HOSTNAMES;
});

describe("verifyTurnstileToken", () => {
  it("is a no-op when TURNSTILE_SECRET is unset (captcha not configured)", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const r = await verifyTurnstileToken("tok", "login");
    expect(r).toEqual({ ok: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails with missing-token when the token is absent", async () => {
    process.env.TURNSTILE_SECRET = SECRET;
    process.env.TURNSTILE_HOSTNAMES = HOSTNAMES;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const r = await verifyTurnstileToken(undefined, "login");
    expect(r).toEqual({ ok: false, reason: "missing-token" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects tokens longer than 2048 chars without calling siteverify", async () => {
    process.env.TURNSTILE_SECRET = SECRET;
    process.env.TURNSTILE_HOSTNAMES = HOSTNAMES;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const r = await verifyTurnstileToken("x".repeat(2049), "login");
    expect(r).toEqual({ ok: false, reason: "missing-token" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails closed when TURNSTILE_HOSTNAMES is not configured", async () => {
    process.env.TURNSTILE_SECRET = SECRET;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const r = await verifyTurnstileToken("tok", "login");
    expect(r).toEqual({ ok: false, reason: "invalid-token" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("passes on success + expected action + approved hostname", async () => {
    process.env.TURNSTILE_SECRET = SECRET;
    process.env.TURNSTILE_HOSTNAMES = HOSTNAMES;
    const fetchMock = vi.fn().mockResolvedValue(siteverifyResponse({}));
    vi.stubGlobal("fetch", fetchMock);
    const r = await verifyTurnstileToken("tok", ["login", "signup"]);
    expect(r).toEqual({ ok: true });
    const body = (fetchMock.mock.calls[0][1] as RequestInit).body as URLSearchParams;
    expect(body.get("secret")).toBe(SECRET);
    expect(body.get("response")).toBe("tok");
  });

  it("rejects an unexpected action from the single siteverify call", async () => {
    process.env.TURNSTILE_SECRET = SECRET;
    process.env.TURNSTILE_HOSTNAMES = HOSTNAMES;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(siteverifyResponse({ action: "contact" })));
    const r = await verifyTurnstileToken("tok", ["login", "signup"]);
    expect(r).toEqual({ ok: false, reason: "invalid-token" });
  });

  it("rejects a hostname outside the allowlist (e.g. localhost in production)", async () => {
    process.env.TURNSTILE_SECRET = SECRET;
    process.env.TURNSTILE_HOSTNAMES = HOSTNAMES;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(siteverifyResponse({ hostname: "localhost" })));
    const r = await verifyTurnstileToken("tok", "login");
    expect(r).toEqual({ ok: false, reason: "invalid-token" });
  });

  it("rejects success:false (bad token or replayed token)", async () => {
    process.env.TURNSTILE_SECRET = SECRET;
    process.env.TURNSTILE_HOSTNAMES = HOSTNAMES;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(siteverifyResponse({ success: false })));
    const r = await verifyTurnstileToken("tok", "login");
    expect(r).toEqual({ ok: false, reason: "invalid-token" });
  });

  it("fails closed on network errors", async () => {
    process.env.TURNSTILE_SECRET = SECRET;
    process.env.TURNSTILE_HOSTNAMES = HOSTNAMES;
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ENOTFOUND")));
    const r = await verifyTurnstileToken("tok", "login");
    expect(r).toEqual({ ok: false, reason: "invalid-token" });
  });

  it("rejects non-2xx siteverify responses", async () => {
    process.env.TURNSTILE_SECRET = SECRET;
    process.env.TURNSTILE_HOSTNAMES = HOSTNAMES;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(siteverifyResponse({}, 500)));
    const r = await verifyTurnstileToken("tok", "login");
    expect(r).toEqual({ ok: false, reason: "invalid-token" });
  });

  it("forwards remoteip when provided", async () => {
    process.env.TURNSTILE_SECRET = SECRET;
    process.env.TURNSTILE_HOSTNAMES = HOSTNAMES;
    const fetchMock = vi.fn().mockResolvedValue(siteverifyResponse({}));
    vi.stubGlobal("fetch", fetchMock);
    await verifyTurnstileToken("tok", "login", "203.0.113.9");
    const body = (fetchMock.mock.calls[0][1] as RequestInit).body as URLSearchParams;
    expect(body.get("remoteip")).toBe("203.0.113.9");
  });
});