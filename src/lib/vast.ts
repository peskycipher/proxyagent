/**
 * Vast.ai serverless adapter — OpenAI-compatible proxy client.
 * Verified against https://docs.vast.ai/guides/serverless/openai-compatible-api
 * (fetched 2026-02):
 * - Vast runs a proxy at `openai.vast.ai` that accepts standard OpenAI requests
 *   and routes them to a Serverless vLLM endpoint:
 *   POST https://openai.vast.ai/<ENDPOINT_NAME>/v1/chat/completions
 *   with `Authorization: Bearer <VAST_API_KEY>`.
 * - The `model` field is required by the OpenAI schema but IGNORED by the
 *   proxy — the served model is fixed by the endpoint's MODEL_NAME config.
 * - Both /v1/chat/completions and /v1/completions support stream:true and emit
 *   the same OpenAI `data: {...}` SSE lines llama-server does, so the chat
 *   route's parse loop is provider-agnostic.
 *
 * POLICY: this client is inference ONLY. It never creates, destroys, or
 * rescales endpoints — those are console/dashboard actions (same stop/start-only
 * policy as the Runpod client in ./runpod.ts). Serverless auto-scaling means
 * there is no start/stop lifecycle here at all: cold workers are handled by the
 * proxy, so there is no warmup/health step.
 */

const OPENAI_PROXY_BASE = "https://openai.vast.ai";

/** True when the vast.ai provider has everything it needs configured. */
export function vastConfigured(): boolean {
  return Boolean(process.env.VAST_API_KEY && process.env.VAST_ENDPOINT_NAME);
}

/** The proxy URL for a configured endpoint, or null when incomplete. */
export function vastChatUrl(): string | null {
  const endpoint = process.env.VAST_ENDPOINT_NAME?.replace(/\/+$/, "");
  const key = process.env.VAST_API_KEY;
  if (!endpoint || !key) return null;
  return `${OPENAI_PROXY_BASE}/${endpoint}/v1/chat/completions`;
}

/**
 * POST a chat-completions body ({ stream: true, messages }) to the proxy.
 * Returns the raw upstream Response — the caller handles non-2xx and streams
 * the SSE body itself (same contract as the llama-server call).
 */
export async function vastChatRequest(
  body: string,
  signal: AbortSignal,
): Promise<Response> {
  const url = vastChatUrl();
  if (!url) throw new Error("VAST_API_KEY / VAST_ENDPOINT_NAME not configured");
  return fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.VAST_API_KEY}`,
      "content-type": "application/json",
    },
    body,
    signal,
  });
}