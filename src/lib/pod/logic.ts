/**
 * Pure decision logic for the PodController durable object.
 * No runtime imports (nothing from cloudflare:workers or the network) so the
 * state machine is unit-testable under plain vitest.
 */

export type EnsureRunningResult = "running" | "starting" | "error";

/** Stream lease TTL — matches CHAT_LOCK_TTL_MS so both lapse together. */
export const STREAM_LEASE_TTL_MS = 90_000;
/** Debounce for DO storage writes of lastActivityAt (chunks arrive constantly). */
export const TOUCH_WRITE_INTERVAL_MS = 30_000;
/** How long a "RUNNING" pod snapshot is trusted before re-fetching. */
export const STATUS_CACHE_TTL_MS = 10_000;

export interface PodSnapshot {
  status: string;
  actions: string[];
}

/**
 * What ensureRunning should do with a v2 pod snapshot.
 * - "noop-running": already RUNNING — caller can go straight to health polling.
 * - "wait": a transition is already underway (STARTING/PROVISIONING, or no
 *   `start` action available) — polling llama-server is the right move and a
 *   second `start` call would 409.
 * - "start": the pod needs starting and Runpod advertises the transition.
 * - "error": pod is in ERROR — no transition will fix it.
 */
export function decideStart(pod: PodSnapshot): "noop-running" | "wait" | "start" | "error" {
  if (pod.status === "ERROR" || pod.status === "TERMINATED") return "error";
  if (pod.status === "RUNNING") return "noop-running";
  if (pod.status === "STARTING" || pod.status === "PROVISIONING") return "wait";
  if (pod.actions.includes("start")) return "start";
  // Unknown-but-not-running state without an advertised start action:
  // assume a transition is underway; the health poll confirms or times out.
  return "wait";
}

/**
 * What the idle alarm should do when it fires. Live leases (active streams)
 * always win — a stream that stopped emitting chunks but is still connected
 * (e.g. the model thinking during long prompt eval) must not get its pod
 * stopped underneath it.
 */
export function decideAlarmAction(input: {
  now: number;
  lastActivityAt: number;
  liveLeaseCount: number;
  idleTimeoutMs: number;
}): { action: "rearm"; alarmAt: number } | { action: "stop" } {
  const { now, lastActivityAt, liveLeaseCount, idleTimeoutMs } = input;
  if (liveLeaseCount > 0) return { action: "rearm", alarmAt: now + TOUCH_WRITE_INTERVAL_MS };
  const stopAt = lastActivityAt + idleTimeoutMs;
  if (now < stopAt) return { action: "rearm", alarmAt: stopAt };
  return { action: "stop" };
}

/**
 * Stream leases: userId -> expiry, with TTL sweep. Storage of record lives in
 * the DO; this class holds the in-memory mirror and the sweep/lease rules.
 */
export class LeaseRegistry {
  private leases = new Map<string, number>();

  begin(userId: string, now: number, ttlMs: number): void {
    this.leases.set(userId, now + ttlMs);
  }

  /** Extend only an existing lease — a renew for an unknown stream is a no-op. */
  renew(userId: string, now: number, ttlMs: number): void {
    if (this.leases.has(userId)) this.leases.set(userId, now + ttlMs);
  }

  end(userId: string): void {
    this.leases.delete(userId);
  }

  /** Drop expired leases; return the surviving (live) user ids. */
  live(now: number): string[] {
    const live: string[] = [];
    for (const [userId, expiresAt] of this.leases) {
      if (expiresAt > now) live.push(userId);
      else this.leases.delete(userId);
    }
    return live;
  }

  size(): number {
    return this.leases.size;
  }
}