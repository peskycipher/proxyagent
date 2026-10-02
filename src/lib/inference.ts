import { ensurePodUp, ensureLlamaHealthy, touchPodActivity, beginPodStream, renewPodStream, endPodStream } from "@/lib/pod";

/**
 * Inference provider selection for the chat route.
 *
 * - "direct": llama-server reachable directly at LLAMA_SERVER_URL (the vast.ai
 *   on-demand instance). No pod lifecycle — the instance is already running,
 *   so warmup only polls llama-server /health and idle-stop leases are skipped
 *   (there is nothing to stop).
 * - "runpod": llama.cpp-on-RunPod (pod + DO idle controller) — the rollback
 *   path: set RUNPOD_* vars and MODEL_PROVIDER=runpod.
 *
 * Selected automatically (runpod when RUNPOD_POD_ID is set) with an explicit
 * MODEL_PROVIDER override.
 */

export type InferenceProvider = "runpod" | "direct";

export function activeProvider(): InferenceProvider {
  const explicit = process.env.MODEL_PROVIDER;
  if (explicit === "runpod" || explicit === "direct") return explicit;
  return process.env.RUNPOD_POD_ID && process.env.RUNPOD_API_KEY ? "runpod" : "direct";
}

const LLAMA_BASE = () => (process.env.LLAMA_SERVER_URL || "").replace(/\/$/, "");

function llamaHeaders(): Record<string, string> {
  return {
    "content-type": "application/json",
    ...(process.env.LLAMA_API_KEY ? { Authorization: `Bearer ${process.env.LLAMA_API_KEY}` } : {}),
  };
}

/**
 * Ensures the model backend is ready to accept the request; reports progress
 * via onStatus. runpod: waits for pod start + llama-server /health (see
 * lib/pod.ts). vast: no-op — the proxy holds requests while workers are cold.
 */
export async function ensureModelUp(
  onStatus?: (msg: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  const provider = activeProvider();
  if (provider === "direct") {
    return ensureLlamaHealthy(onStatus, signal);
  }
  return ensurePodUp(onStatus, signal);
}

/** Streams an OpenAI-compatible chat completion from the active provider. */
export async function modelChat(
  messages: Array<{ role: string; content: string }>,
  signal: AbortSignal,
): Promise<Response> {
  const body = JSON.stringify({ stream: true, messages });
  return fetch(`${LLAMA_BASE()}/v1/chat/completions`, {
    method: "POST",
    headers: llamaHeaders(),
    body,
    signal,
  });
}

/** Activity/idle-stop plumbing: meaningful on runpod, no-ops on vast. */
export function touchModelActivity(): void {
  if (activeProvider() === "runpod") touchPodActivity();
}
export function beginModelStream(userId: string): void {
  if (activeProvider() === "runpod") beginPodStream(userId);
}
export function renewModelStream(userId: string): void {
  if (activeProvider() === "runpod") renewPodStream(userId);
}
export function endModelStream(userId: string): void {
  if (activeProvider() === "runpod") endPodStream(userId);
}