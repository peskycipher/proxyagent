import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getPod, startPod, stopPod, isConflict } from "./backend";
import { logger } from "@/lib/logger";
import { decideStart, type EnsureRunningResult } from "./logic";
import type { PodController } from "./PodController";
import type { BackendEvent } from "../vast-events";

/**
 * Pod control driver selection.
 *
 * - "durable": production path — every transition is serialized through the
 *   PodController Durable Object (single writer, alarm-driven idle stop).
 * - "inline": the legacy in-process path, kept for `next dev` where DO
 *   bindings don't exist. Also the degraded fallback if the binding is ever
 *   unresolvable in production — chat must never break because the control
 *   plane is missing; the worst case is a pod that doesn't auto-stop.
 *
 * POD_CONTROL_MODE=auto (default) | durable | inline.
 *
 * All control calls swallow and log their own errors: the chat request path
 * must stay usable even when the controller is unreachable.
 */

type PodControlMode = "auto" | "inline" | "durable";

interface PodControl {
  touchActivity(): Promise<void>;
  ensureRunning(): Promise<EnsureRunningResult>;
  beginStream(userId: string): Promise<void>;
  renewStream(userId: string): Promise<void>;
  endStream(userId: string): Promise<void>;
  /** Ingest a verified vast.ai webhook event (chat-box backend pill). */
  saveVastEvent(e: BackendEvent): Promise<void>;
  /** Last-known backend state for the chat box, health-verified when stale. */
  backendStatus(): Promise<BackendEvent | null>;
}

const IDLE_TIMEOUT_MS = () => Number(process.env.POD_IDLE_TIMEOUT_SECONDS || 600) * 1000;

// ---------------------------------------------------------------- durable ---

/**
 * Resolve the pod-control binding FRESH on every call.
 *
 * Durable-Object stubs (and the env they come from) are request-bound I/O
 * objects in workerd: a stub created during request A throws "Cannot perform
 * I/O on behalf of a different request" when reused from request B. Caching
 * the stub/namespace module-globally made every podControl() call on a REUSED
 * isolate fail — surfacing as "pod is in ERROR state" sends with a healthy
 * pod, and a backend pill that flipped between live and null. getByName() is
 * deterministic, so per-call stubs still hit the same actor.
 */
function resolveBinding(): DurableObjectNamespace<import("./PodController").PodController> | null {
  const mode = (process.env.POD_CONTROL_MODE || "auto") as PodControlMode;
  if (mode === "inline") return null;
  try {
    return (getCloudflareContext().env.POD_CONTROLLER as
      | DurableObjectNamespace<PodController>
      | undefined) ?? null;
  } catch {
    // Outside workerd (next dev) or outside a request context — inline mode.
    return null;
  }
}

function doStub(): PodController | null {
  return resolveBinding()?.getByName("pod-controller") ?? null;
}

/** Run a control-plane call, degrading to no-op on any failure. */
async function run<R>(label: string, fn: (stub: PodController) => Promise<R>): Promise<R | undefined> {
  try {
    const stub = doStub();
    if (!stub) return undefined;
    return await fn(stub);
  } catch (e) {
    logger.error(`pod control ${label} failed`, { error: (e as Error).message });
    return undefined;
  }
}

const durable: PodControl = {
  touchActivity: () => run("touchActivity", (s) => s.touchActivity()).then(() => undefined),
  beginStream: (userId) => run("beginStream", (s) => s.beginStream(userId)).then(() => undefined),
  renewStream: (userId) => run("renewStream", (s) => s.renewStream(userId)).then(() => undefined),
  endStream: (userId) => run("endStream", (s) => s.endStream(userId)).then(() => undefined),
  saveVastEvent: (e) => run("saveVastEvent", (s) => s.saveVastEvent(e)).then(() => undefined),
  backendStatus: () => run("backendStatus", (s) => s.backendStatus()).then((r) => r ?? null),
  async ensureRunning() {
    const stub = doStub();
    if (!stub) return inline.ensureRunning();
    try {
      return await stub.ensureRunning();
    } catch (e) {
      logger.error("pod controller ensureRunning failed", { error: (e as Error).message });
      return "error";
    }
  },
};

// ----------------------------------------------------------------- inline ---

let lastActivityAt = 0;
let idleStopperStarted = false;
/** Inline-mode backend state (dev/degraded — same-isolate only). */
let inlineBackendEvent: BackendEvent | null = null;

const inline: PodControl = {
  async touchActivity() {
    lastActivityAt = Date.now();
    if (!idleStopperStarted) startInlineIdleStopper();
  },
  async ensureRunning(): Promise<EnsureRunningResult> {
    let pod;
    try {
      pod = await getPod();
    } catch (e) {
      logger.error("inline pod control getPod failed", { error: (e as Error).message });
      return "error";
    }
    const decision = decideStart(pod);
    if (decision === "error") return "error";
    if (decision === "start") {
      try {
        await startPod();
      } catch (e) {
        if (!isConflict(e)) {
          logger.error("inline pod control startPod failed", { error: (e as Error).message });
          return "error";
        }
      }
    }
    return decision === "noop-running" ? "running" : "starting";
  },
  async beginStream() {},
  async renewStream() {},
  async endStream() {},
  async saveVastEvent(e) {
    inlineBackendEvent = e;
  },
  async backendStatus() {
    return inlineBackendEvent;
  },
};

function startInlineIdleStopper(): void {
  idleStopperStarted = true;
  const timer = setInterval(async () => {
    try {
      if (lastActivityAt === 0) return;
      if (Date.now() - lastActivityAt < IDLE_TIMEOUT_MS()) return;
      const pod = await getPod();
      if (pod.status === "RUNNING") {
        await stopPod();
        logger.info("pod stopped after idle timeout");
      }
      clearInterval(timer);
      idleStopperStarted = false;
    } catch (e) {
      logger.error("idle stopper error", { error: (e as Error).message });
    }
  }, 30_000);
  // Dev-only (Node): don't hold the process open.
  timer.unref();
}

// ----------------------------------------------------------------- public ---

export function podControl(): PodControl {
  return doStub() ? durable : inline;
}