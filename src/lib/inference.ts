import {
  ensurePodUp,
  touchPodActivity,
  beginPodStream,
  renewPodStream,
  endPodStream,
} from "@/lib/pod";
import { vastChatRequest, vastConfigured } from "@/lib/vast";

/**
 * Inference provider selection for the chat route.
 *
 * - "vast": Vast.ai Serverless (openai.vast.ai OpenAI-compatible proxy).
 *   No pod lifecycle at all — serverless auto-scales, so warmup is a no-op
 *   and the idle-stop stream leases are skipped (there is nothing to stop).
 * - "runpod": the original llama.cpp-on-RunPod path (pod + DO idle controller).
 *
 * Selected automatically by configuration (vast wins when its env vars are
 * fully set) with an explicit MODEL_PROVIDER override. The current production
 * deployment sets neither VAST_* var, so behavior is unchanged there.
 */

export type InferenceProvider = "runpod" | "vast";

export function activeProvider(): InferenceProvider {
  const explicit = process.env.MODEL_PROVIDER;
  if (explicit === "vast" || explicit === "runpod") return explicit;
  return vastConfigured() ? "vast" : "runpod";
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
  if (activeProvider() === "vast") {
    onStatus?.("ready");
    return;
  }
  return ensurePodUp(onStatus, signal);
}

/** Streams an OpenAI-compatible chat completion from the active provider. */
export async function modelChat(
  messages: Array<{ role: string; content: string }>,
  signal: AbortSignal,
): Promise<Response> {
  const body = JSON.stringify({ stream: true, messages });
  if (activeProvider() === "vast") return vastChatRequest(body, signal);
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