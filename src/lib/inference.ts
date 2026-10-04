import { getCloudflareContext } from "@opennextjs/cloudflare";
import { ensurePodUp, ensureLlamaHealthy, touchPodActivity, beginPodStream, renewPodStream, endPodStream } from "@/lib/pod";
import { configured as vastConfigured, llamaBase } from "@/lib/vast";
import { track } from "@/lib/telemetry";

/**
 * Inference provider selection for the chat route.
 *
 * - "direct": llama-server on the vast.ai on-demand instance. If VAST_API_KEY
 *   + VAST_INSTANCE_ID are set the instance has a full lifecycle (start on
 *   demand, idle-stop to zero via the PodController DO); its llama endpoint is
 *   resolved dynamically because the IP can change across stop→start cycles.
 *   Without VAST_* vars it degrades to the legacy static behavior: the
 *   instance is assumed already running at LLAMA_SERVER_URL (no idle stop).
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

/** Direct provider with a managed lifecycle? */
const directLifecycle = () => activeProvider() === "direct" && vastConfigured();

function llamaHeaders(): Record<string, string> {
  return {
    "content-type": "application/json",
    ...(process.env.LLAMA_API_KEY ? { Authorization: `Bearer ${process.env.LLAMA_API_KEY}` } : {}),
  };
}

/**
 * Ensures the model backend is ready to accept the request; reports progress
 * via onStatus. Vast/runpod: waits for backend start + llama-server /health
 * (see lib/pod.ts). Static direct setup: only polls /health — the proxy holds
 * requests while the server is cold.
 */
export async function ensureModelUp(
  onStatus?: (msg: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  if (directLifecycle() || activeProvider() === "runpod") {
    return ensurePodUp(onStatus, signal);
  }
  return ensureLlamaHealthy(onStatus, signal);
}

/**
 * Chat-landing warmup: when a user lands on /chat, check whether the model
 * backend is up and start it if it is off, so their first chat message
 * doesn't pay the cold start. Cheaper than warming on login — visitors who
 * never intend to chat don't start the pod. Fire-and-forget — the page
 * render must never block or fail on pod control. On the deployed worker
 * the in-flight warmup is attached via ctx.waitUntil so it survives the
 * page response; in `next dev` (no worker context) it runs on the
 * standalone promise.
 */
export function warmModelOnChatLanding(): void {
  const p = (async (): Promise<void> => {
    try {
      await ensureModelUp();
      track("pod.post_login_warmup_complete", { "app.pod.warmup_trigger": "chat_landing" });
    } catch (e) {
      track("pod.post_login_warmup_failed", {
        "app.pod.warmup_trigger": "chat_landing",
        "app.pod.error": (e as Error).message.slice(0, 120),
      });
    }
  })();
  try {
    getCloudflareContext().ctx?.waitUntil(p);
  } catch {
    // Outside workerd (next dev): no execution context to attach to.
  }
}

/** Streams an OpenAI-compatible chat completion from the active provider. */
export async function modelChat(
  messages: Array<{ role: string; content: string }>,
  signal: AbortSignal,
): Promise<Response> {
  // llama.cpp ≥0.5.0-dev rejects requests without an explicit model name
  // ("model name is missing from the request"). The value must match the
  // instance's llama-server --alias (LLAMA_MODEL_ID), else "model not found".
  const model = process.env.LLAMA_MODEL_ID;
  const body = JSON.stringify(model ? { stream: true, model, messages } : { stream: true, messages });
  return fetch(`${await llamaBase()}/v1/chat/completions`, {
    method: "POST",
    headers: llamaHeaders(),
    body,
    signal,
  });
}

/** Activity/idle-stop plumbing: meaningful on runpod, no-ops on vast. */
export function touchModelActivity(): void {
  if (activeProvider() === "runpod" || directLifecycle()) touchPodActivity();
}
export function beginModelStream(userId: string): void {
  if (activeProvider() === "runpod" || directLifecycle()) beginPodStream(userId);
}
export function renewModelStream(userId: string): void {
  if (activeProvider() === "runpod" || directLifecycle()) renewPodStream(userId);
}
export function endModelStream(userId: string): void {
  if (activeProvider() === "runpod" || directLifecycle()) endPodStream(userId);
}