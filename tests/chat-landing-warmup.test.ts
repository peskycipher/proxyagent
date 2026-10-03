import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// warmModelOnChatLanding must never block or reject the login path: successful
// warmups and warmup failures both land in telemetry, and the in-flight
// promise is attached to the worker ctx when one exists.

vi.mock("@/lib/pod", () => ({
  ensurePodUp: vi.fn(),
  ensureLlamaHealthy: vi.fn(),
  touchPodActivity: vi.fn(),
  beginPodStream: vi.fn(),
  renewPodStream: vi.fn(),
  endPodStream: vi.fn(),
}));

vi.mock("@/lib/vast", () => ({
  configured: () => false,
  llamaBase: vi.fn(async () => "http://llama.test"),
}));

type WaitUntilFn = (p: Promise<unknown>) => void;
let waitUntil: WaitUntilFn | undefined;
vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: () => ({ ctx: { waitUntil } }),
}));

vi.mock("@/lib/telemetry", () => ({ track: vi.fn() }));

import { warmModelOnChatLanding } from "@/lib/inference";
import { ensurePodUp } from "@/lib/pod";
import { track } from "@/lib/telemetry";

describe("warmModelOnChatLanding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.MODEL_PROVIDER = "runpod";
    waitUntil = (p) => p.catch(() => undefined);
  });
  afterEach(() => {
    delete process.env.MODEL_PROVIDER;
    waitUntil = undefined;
  });

  /** warmModelOnChatLanding is fire-and-forget; await the attached promise. */
  async function settle(): Promise<void> {
    let done: () => void = () => undefined;
    // Re-attach via the same mock ctx: flush microtasks until track fired.
    for (let i = 0; i < 50; i++) {
      await new Promise<void>((r) => setTimeout(r, 10));
      if (vi.mocked(track).mock.calls.length > 0) done = () => undefined;
      if (done !== undefined && vi.mocked(track).mock.calls.length > 0) break;
    }
    return done();
  }

  it("completes and tracks a post-login warmup", async () => {
    vi.mocked(ensurePodUp).mockResolvedValue(undefined);
    expect(() => warmModelOnChatLanding()).not.toThrow();
    await settle();
    expect(vi.mocked(ensurePodUp).mock.calls.length).toBeGreaterThan(0);
    expect(track).toHaveBeenCalledWith("pod.post_login_warmup_complete", {
      "app.pod.warmup_trigger": "chat_landing",
    });
  });

  it("tracks warmup failures without rejecting the chat page render", async () => {
    vi.mocked(ensurePodUp).mockRejectedValue(new Error("pod is in ERROR state — check the provider console"));
    expect(() => warmModelOnChatLanding()).not.toThrow();
    await settle();
    expect(track).toHaveBeenCalledWith("pod.post_login_warmup_failed", {
      "app.pod.warmup_trigger": "chat_landing",
      "app.pod.error": "pod is in ERROR state — check the provider console",
    });
  });

  it("survives a missing worker execution context (next dev)", async () => {
    waitUntil = undefined;
    vi.mocked(ensurePodUp).mockImplementation(() => new Promise(() => undefined)); // never settles
    expect(() => warmModelOnChatLanding()).not.toThrow();
    expect(vi.mocked(ensurePodUp).mock.calls.length).toBeGreaterThan(0);
  });
});