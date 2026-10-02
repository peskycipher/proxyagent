import { podControl } from "@/lib/pod/control";
import { llamaHealthy } from "@/lib/runpod";

/**
 * Pod lifecycle: ensure running before a chat request, auto-stop after idle.
 *
 * Lifecycle *decisions* (start / idle-stop) live in the PodController durable
 * object via the driver in ./control; this module keeps only what is
 * inherently request-local: the warmup health-poll loop with SSE progress
 * reporting, and thin wrappers over the driver for the chat route.
 */

const WARMUP_TIMEOUT_MS = () => Number(process.env.POD_WARMUP_TIMEOUT_SECONDS || 300) * 1000;

/**
 * Ensures the pod is running and llama-server is healthy; reports progress via
 * onStatus. Resolves only once llama-server answers /health — a pod that is
 * merely RUNNING but still loading model weights is not "up".
 * `signal` is the client's disconnect signal: an abandoning user stops the
 * warmup poll (and releases the chat lock) instead of holding it for the full
 * warmup timeout.
 */
export async function ensurePodUp(
  onStatus?: (msg: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  touchPodActivity();
  const result = await podControl().ensureRunning();
  if (result === "error") {
    throw new Error("pod is in ERROR state on Runpod — check the Runpod console");
  }
  if (result === "starting") {
    onStatus?.("pod_starting");
  }
  return ensureLlamaHealthy(onStatus, signal);
}

/** Polls llama-server /health until it answers, without pod lifecycle. */
export async function ensureLlamaHealthy(
  onStatus?: (msg: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  const deadline = Date.now() + WARMUP_TIMEOUT_MS();
  // llama-server boot takes a while (model weights loading); poll health.
  for (;;) {
    if (signal?.aborted) {
      throw new Error("client disconnected during pod warmup");
    }
    if (await llamaHealthy()) {
      onStatus?.("ready");
      return;
    }
    if (Date.now() > deadline) {
      throw new Error("pod warmup timed out; try again shortly");
    }
    onStatus?.("model_loading");
    await sleep(3000);
  }
}

/** Records activity (and refreshes the idle alarm via the controller). */
export function touchPodActivity(): void {
  void podControl().touchActivity();
}

/** Register/refresh/release this user's stream lease with the controller. */
export function beginPodStream(userId: string): void {
  void podControl().beginStream(userId);
}
export function renewPodStream(userId: string): void {
  void podControl().renewStream(userId);
}
export function endPodStream(userId: string): void {
  void podControl().endStream(userId);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}