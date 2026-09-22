/**
 * Runpod REST v2 pod control. Verified against the live API 2026-09-22:
 * - GET /v2/pods/{id} returns `status` (PROVISIONING|STARTING|RUNNING|EXITED|ERROR|TERMINATED)
 *   and `actions` — NOT the v1 `desiredStatus` (spec/live drift: trust the API).
 * - POST /v2/pods/{id}/action with {"action":"start"|"stop"}; invalid transitions
 *   return 409 (e.g. stop on EXITED), capacity failures 400.
 */

const API_BASE = "https://api.runpod.io/v2";

export interface PodState {
  desiredStatus: string;
  runtimeStatus: string | null;
  actions: string[];
}

function apiKey(): string {
  const key = process.env.RUNPOD_API_KEY;
  if (!key) throw new Error("RUNPOD_API_KEY not configured");
  return key;
}

function podId(): string {
  const id = process.env.RUNPOD_POD_ID;
  if (!id) throw new Error("RUNPOD_POD_ID not configured");
  return id;
}

async function runpodFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${API_BASE}/pods/${podId()}${path ?? ""}`, {
    ...init,
    headers: { Authorization: `Bearer ${apiKey()}`, ...(init?.headers ?? {}) },
    signal: AbortSignal.timeout(20000),
  });
}

export async function getPod(): Promise<{ status: string; runtimeStatus: string | null; actions: string[] }> {
  const res = await runpodFetch("");
  if (!res.ok) throw new Error(`getPod failed: ${res.status}`);
  const body = (await res.json()) as { status?: string; runtimeStatus?: string; actions?: string[] };
  return {
    status: body.status ?? "UNKNOWN",
    runtimeStatus: body.runtimeStatus ?? null,
    actions: body.actions ?? [],
  };
}

export async function startPod(): Promise<void> {
  const res = await runpodFetch("/action", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "start" }),
  });
  if (!res.ok) throw new Error(`startPod failed: ${res.status} ${await res.text().catch(() => "")}`);
}

export async function stopPod(): Promise<void> {
  const res = await runpodFetch("/action", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "stop" }),
  });
  if (!res.ok) throw new Error(`stopPod failed: ${res.status} ${await res.text().catch(() => "")}`);
}

/** llama.cpp llama-server health check. */
export async function llamaHealthy(): Promise<boolean> {
  const base = process.env.LLAMA_SERVER_URL;
  if (!base) return false;
  try {
    const res = await fetch(`${base.replace(/\/$/, "")}/health`, {
      headers: process.env.LLAMA_API_KEY ? { Authorization: `Bearer ${process.env.LLAMA_API_KEY}` } : {},
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return false;
    const body = (await res.json().catch(() => null)) as { status?: string } | null;
    return body?.status === "ok" || res.ok;
  } catch {
    return false;
  }
}