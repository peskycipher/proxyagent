/**
 * Vast.ai REST pod control for the "direct" provider (the on-demand llama.cpp
 * instance). Mirrors the runpod.ts surface (getPod/startPod/stopPod + llama
 * health) so the pod-control layer selects between them by env.
 *
 * Endpoints verified against the live API 2026-10-02 (CLI --curl equivalence):
 * - GET /api/v0/instances/{id}/ returns {"instances": {...}} with cur_state,
 *   public_ipaddr and ports.
 * - PUT /api/v0/instances/{id}/ with {"state":"running"|"stopped"}.
 * The console API is rate-limited aggressively (~1 req/s): every call here is
 * at most once per decision point, and llamaBase() caches its lookup.
 *
 * POLICY: state changes are stop/start ONLY — never terminate/destroy. A
 * destroyed instance loses its volume; termination is a console action.
 */

const API_BASE = "https://console.vast.ai/api/v0";

import type { PodSnapshot } from "@/lib/pod/logic";
import { track } from "@/lib/telemetry";

export class VastError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "VastError";
  }
}

/** True when the error is a start/stop race or other non-actionable transition. */
export function isConflict(e: unknown): boolean {
  return e instanceof VastError && (e.status === 409 || e.status === 400);
}

/** The direct provider gains lifecycle when a vast instance is configured. */
export function configured(): boolean {
  return process.env.MODEL_PROVIDER !== "runpod" && !!process.env.VAST_API_KEY && !!process.env.VAST_INSTANCE_ID;
}

function apiKey(): string {
  const key = process.env.VAST_API_KEY;
  if (!key) throw new Error("VAST_API_KEY not configured");
  return key;
}

function instanceId(): string {
  const id = process.env.VAST_INSTANCE_ID;
  if (!id) throw new Error("VAST_INSTANCE_ID not configured");
  return id;
}

async function vastFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${API_BASE}/instances/${instanceId()}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${apiKey()}`, ...(init?.headers ?? {}) },
    signal: AbortSignal.timeout(20000),
  });
}

/** Map vast's cur_state onto the pod-control state machine. */
export function mapVastStatus(curState: string): PodSnapshot {
  switch (curState) {
    case "running":
      return { status: "RUNNING", actions: ["stop"] };
    case "loading":
      return { status: "STARTING", actions: ["start"] };
    case "destroyed":
      return { status: "ERROR", actions: [] };
    case "error":
      // Restartable, NOT fatal: budget host 27389 intermittently reports
      // cur_state "error" and self-recovers within minutes (observed 3x
      // 2026-10-03, ending in stopped/running). Vast's own console remedy
      // for an errored instance is a restart, so advertise one — decideStart
      // then paths into the normal start→conflict→health-fallback flow.
      // Only "destroyed" is unrecoverable (volume is gone).
      return { status: "EXITED", actions: ["start"] };
    default:
      // stopped, exited, created… — restartable via start.
      return { status: "EXITED", actions: ["start"] };
  }
}

export async function getPod(): Promise<{ status: string; runtimeStatus: string | null; actions: string[] }> {
  const res = await vastFetch("/");
  if (!res.ok) throw new VastError(`getPod failed: ${res.status} ${await res.text().catch(() => "")}`, res.status);
  const body = (await res.json()) as {
    instances?: { cur_state?: string; public_ipaddr?: string | null; ports?: Record<string, Array<{ HostPort?: number }>> };
  };
  const ins = body.instances ?? {};
  if (ins.cur_state === "error") {
    // Measurable, not just mapped: recurring occurrences on host 27389 are
    // queryable on the Honeycomb board via app.event = "pod.vast_error_seen".
    track("pod.vast_error_seen", { "app.pod.machine_id": "27389" });
  }
  if (ins.cur_state === "running" && ins.public_ipaddr) learnHost(ins.public_ipaddr, llamaPort(ins.ports));
  return { ...mapVastStatus(ins.cur_state ?? "unknown"), runtimeStatus: null };
}

async function setState(state: "running" | "stopped"): Promise<void> {
  const res = await vastFetch("/", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ state }),
  });
  if (!res.ok) throw new VastError(`setState(${state}) failed: ${res.status} ${await res.text().catch(() => "")}`, res.status);
}

export async function startPod(): Promise<void> {
  await setState("running");
}

export async function stopPod(): Promise<void> {
  await setState("stopped");
}

// --------------------------------------------------------------- host learn --

/** llama-server container port (SERVE_PORT in the instance template). */
const LLAMA_CONTAINER_PORT = "8080/tcp";

function llamaPort(ports?: Record<string, Array<{ HostPort?: number }>>): number | null {
  const mapping = ports?.[LLAMA_CONTAINER_PORT]?.[0];
  if (mapping?.HostPort) return mapping.HostPort;
  // Fallback: the port baked into LLAMA_SERVER_URL (e.g. :26950).
  try {
    const urlPort = new URL(process.env.LLAMA_SERVER_URL || "").port;
    return urlPort ? Number(urlPort) : null;
  } catch {
    return null;
  }
}

// The provider's llama server address. LLAMA_SERVER_URL is the env-time value;
// after a stop→start cycle the instance IP can change, so getPod() records the
// public ipaddr+port it fetched and llamaBase()/llamaHealthy() prefer it.
let hostOverride: { host: string; at: number } | null = null;
const HOST_TTL_MS = 60_000;

function learnHost(ip: string, port: number | null): void {
  if (!port) return;
  hostOverride = { host: `${ip}:${port}`, at: Date.now() };
}

/** llama-server base URL, learning the current IP from the vast API as needed. */
export async function llamaBase(): Promise<string> {
  if (hostOverride && Date.now() - hostOverride.at < HOST_TTL_MS) return `http://${hostOverride.host}`;
  if (configured()) {
    try {
      await getPod();
    } catch {
      // fall back to the env URL below
    }
  }
  return (process.env.LLAMA_SERVER_URL || "").replace(/\/$/, "");
}

/** llama.cpp llama-server health check at the learned/env base. */
export async function llamaHealthy(): Promise<boolean> {
  const base = await llamaBase();
  if (!base) return false;
  try {
    const res = await fetch(`${base}/health`, {
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