import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Minimal repros for the user-visible "pod is in ERROR state — check the
 * provider console" fired while the provider was actually healthy:
 *
 * PodController.ensureRunning mapped ANY getPod/startPod exception (vast
 * console API 429/5xx/timeout — it is documented as aggressively rate-limited)
 * to "error", which PodControl.ensurePodUp turns into a fatal user-facing
 * message. A control-plane hiccup is not evidence the pod itself is dead;
 * only the provider's own ERROR/TERMINATED snapshot is.
 */

vi.mock("cloudflare:workers", () => {
  class DurableObjectStub {
    constructor(public ctx: unknown, public env: unknown) {}
  }
  return { DurableObject: DurableObjectStub };
});

vi.mock("@/lib/pod/backend", () => ({
  getPod: vi.fn(),
  startPod: vi.fn(),
  stopPod: vi.fn(),
  isConflict: vi.fn(() => false),
  llamaHealthy: vi.fn(),
}));

import { PodController } from "@/lib/pod/PodController";
import { getPod, llamaHealthy, startPod } from "@/lib/pod/backend";

const RUNNING = { status: "RUNNING", actions: ["stop"], runtimeStatus: null };
const EXITED = { status: "EXITED", actions: ["start"], runtimeStatus: null };
const ERROR_SNAPSHOT = { status: "ERROR", actions: [], runtimeStatus: null };

function fakeCtx() {
  const map = new Map<string, unknown>();
  return {
    storage: {
      get: async (k: string) => map.get(k),
      put: async (k: string, v: unknown) => void map.set(k, v),
      delete: async (k: string) => void map.delete(k),
      getAlarm: async () => null,
      setAlarm: async () => {},
      deleteAlarm: async () => {},
    },
  } as never;
}

const controller = () => new PodController(fakeCtx(), {});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PodController.ensureRunning — transient control-plane failures", () => {
  it("getPod 429 with llama healthy ⇒ running (was: fatal error)", async () => {
    vi.mocked(getPod).mockRejectedValueOnce(new Error("getPod failed: 429"));
    vi.mocked(llamaHealthy).mockResolvedValueOnce(true);
    await expect(controller().ensureRunning()).resolves.toBe("running");
  });

  it("getPod 429 with llama unhealthy ⇒ starting (warmup poll rides it out)", async () => {
    vi.mocked(getPod).mockRejectedValueOnce(new Error("getPod failed: 429"));
    vi.mocked(llamaHealthy).mockResolvedValueOnce(false);
    await expect(controller().ensureRunning()).resolves.toBe("starting");
  });

  it("startPod 429 with llama healthy ⇒ running (was: fatal error)", async () => {
    vi.mocked(getPod).mockResolvedValueOnce(EXITED);
    vi.mocked(startPod).mockRejectedValueOnce(new Error("setState(running) failed: 429"));
    vi.mocked(llamaHealthy).mockResolvedValueOnce(true);
    await expect(controller().ensureRunning()).resolves.toBe("running");
  });

  it("provider-confirmed ERROR snapshot still ⇒ error (no over-fix)", async () => {
    vi.mocked(getPod).mockResolvedValueOnce(ERROR_SNAPSHOT);
    await expect(controller().ensureRunning()).resolves.toBe("error");
  });

  it("happy path unaffected: RUNNING ⇒ running", async () => {
    vi.mocked(getPod).mockResolvedValueOnce(RUNNING);
    await expect(controller().ensureRunning()).resolves.toBe("running");
  });
});