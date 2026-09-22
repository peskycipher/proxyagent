import { getPod, startPod, stopPod, llamaHealthy } from "@/lib/runpod";

/**
 * Pod lifecycle: ensure running before a chat request, auto-stop after idle.
 */

const IDLE_TIMEOUT_MS = () => Number(process.env.POD_IDLE_TIMEOUT_SECONDS || 600) * 1000;
const WARMUP_TIMEOUT_MS = () => Number(process.env.POD_WARMUP_TIMEOUT_SECONDS || 300) * 1000;

let lastActivityAt = 0;
let idleStopperStarted = false;

export function touchPodActivity(): void {
  lastActivityAt = Date.now();
  if (!idleStopperStarted) startIdleStopper();
}

export function idleSeconds(): number {
  return lastActivityAt === 0 ? 0 : Math.floor((Date.now() - lastActivityAt) / 1000);
}

/** Ensures the pod is running and llama-server is healthy; reports progress via onStatus. */
export async function ensurePodUp(onStatus?: (msg: string) => void): Promise<void> {
  touchPodActivity();
  const pod = await getPod();
  if (pod.desiredStatus !== "RUNNING") {
    onStatus?.("pod_starting");
    await startPod();
  }
  const deadline = Date.now() + WARMUP_TIMEOUT_MS();
  // llama-server boot takes a while (model weights loading); poll health.
  for (;;) {
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

/** Auto-stops the pod after the idle timeout (operator cost control). */
function startIdleStopper(): void {
  idleStopperStarted = true;
  const timer = setInterval(async () => {
    try {
      if (lastActivityAt === 0) return;
      if (Date.now() - lastActivityAt < IDLE_TIMEOUT_MS()) return;
      const pod = await getPod();
      if (pod.desiredStatus === "RUNNING") {
        await stopPod();
        console.log("pod stopped after idle timeout");
      }
      clearInterval(timer);
      idleStopperStarted = false;
    } catch (e) {
      console.error("idle stopper error", (e as Error).message);
    }
  }, 30_000);
  // don't hold the process open in dev
  if (typeof timer.unref === "function") timer.unref();
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}