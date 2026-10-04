import { DurableObject } from "cloudflare:workers";
import { getPod, startPod, stopPod, isConflict, llamaHealthy } from "./backend";
import type { BackendEvent } from "../vast-events";
import { logger } from "@/lib/logger";
import { track } from "@/lib/telemetry";
import {
  STATUS_CACHE_TTL_MS,
  STREAM_LEASE_TTL_MS,
  TOUCH_WRITE_INTERVAL_MS,
  decideAlarmAction,
  decideStart,
  type PodSnapshot,
} from "./logic";

/**
 * Single-owner pod lifecycle controller.
 *
 * Every Runpod start/stop transition goes through this Durable Object, so no
 * two isolates can race duplicate transitions (the old 409 bug). The idle
 * stop runs as a DO alarm — it fires with zero request traffic, sub-minute
 * precision, and survives isolate death and deploys.
 *
 * Storage of record (ctx.storage): `lastActivityAt`, `lease:<userId>` expiry
 * stamps, and a short-lived `statusCache` of the last v2 pod snapshot.
 */

const LEASE_PREFIX = "lease:";

interface StatusCache {
  status: string;
  actions: string[];
  at: number;
}

/** How long a non-live health-probe result is trusted across heartbeats. */
const BACKEND_PROBE_TTL_MS = 20_000;
/** Fresh "live" event replaces this many ms after arrival. */
const BACKEND_EVENT_FRESH_MS = 12 * 60_000;

const idleTimeoutMs = () => Number(process.env.POD_IDLE_TIMEOUT_SECONDS || 600) * 1000;

export class PodController extends DurableObject {
  constructor(ctx: DurableObjectState, env: unknown) {
    super(ctx, env);
    // A restart (isolate eviction, deploy) must not orphan the idle alarm.
    void this.restoreAlarm();
  }

  private async restoreAlarm(): Promise<void> {
    try {
      const last = await this.ctx.storage.get<number>("lastActivityAt");
      const armed = await this.ctx.storage.getAlarm();
      if (last !== undefined && armed === null) {
        await this.ctx.storage.setAlarm(last + idleTimeoutMs());
      }
    } catch (e) {
      logger.error("pod controller alarm restore failed", { error: (e as Error).message });
    }
  }

  /**
   * Ensure the pod is running (idempotent, serialized by the DO runtime).
   * Returns quickly — the caller polls llama-server health locally for
   * per-request SSE progress.
   */
  /**
   * Control-plane hiccup fallback (vast console API 429/5xx/timeout, network
   * blip). A provider API failure is not evidence the pod itself is dead — ask
   * llama-server health for ground truth: healthy ⇒ "running", otherwise
   * "starting" (the caller's warmup poll decides the outcome). Only the
   * provider's own ERROR/TERMINATED snapshot is fatal.
   */
  private async controlPlaneFallback(): Promise<"running" | "starting"> {
    return (await llamaHealthy()) ? "running" : "starting";
  }

  async ensureRunning(): Promise<"running" | "starting" | "error"> {
    await this.touchActivity();
    const cached = await this.ctx.storage.get<StatusCache>("statusCache");
    if (cached && cached.status === "RUNNING" && Date.now() - cached.at < STATUS_CACHE_TTL_MS) {
      return "running";
    }

    let pod: PodSnapshot;
    try {
      pod = await getPod();
    } catch (e) {
      logger.error("pod controller getPod failed (control-plane fallback)", { error: (e as Error).message });
      return this.controlPlaneFallback();
    }

    const decision = decideStart(pod);
    if (decision === "error") {
      logger.error("pod controller: pod in ERROR state", { status: pod.status });
      await this.ctx.storage.delete("statusCache");
      return "error";
    }

    if (decision === "start") {
      try {
        await startPod();
      } catch (e) {
        if (!isConflict(e)) {
          logger.error("pod controller startPod failed (control-plane fallback)", { error: (e as Error).message });
          return this.controlPlaneFallback();
        }
        // conflict = another actor already started it — treat as "starting".
      }
    }

    await this.ctx.storage.put<StatusCache>("statusCache", {
      status: decision === "noop-running" ? "RUNNING" : "STARTING",
      actions: pod.actions,
      at: Date.now(),
    });
    return decision === "noop-running" ? "running" : "starting";
  }

  /**
   * Record activity and (re)arm the idle alarm. Writes are debounced to
   * TOUCH_WRITE_INTERVAL_MS — chat streams call this per chunk, and DO storage
   * writes are not free. Under-recording by ≤30s is fine against a ≥600s idle
   * window; a still-live stream is protected by its lease at alarm time anyway.
   */
  async touchActivity(): Promise<void> {
    const now = Date.now();
    const prev = await this.ctx.storage.get<number>("lastActivityAt");
    if (prev !== undefined && now - this.lastTouchWrite < TOUCH_WRITE_INTERVAL_MS) return;
    this.lastTouchWrite = now;
    await this.ctx.storage.put("lastActivityAt", now);
    await this.ctx.storage.setAlarm(now + idleTimeoutMs());
  }

  private lastTouchWrite = 0;

  /**
   * Ingest a verified vast.ai webhook event (see src/lib/vast-events.ts).
   * Stores the latest backend event and drops the RUNNING statusCache so
   * ensureRunning re-reads ground truth immediately after a stop/offline —
   * no 10s window of stale "RUNNING" trust after vast knows it's down.
   */
  async saveVastEvent(e: BackendEvent): Promise<void> {
    await this.ctx.storage.put("backendEvent", e);
    if (e.state !== "live") await this.ctx.storage.delete("statusCache");
  }

  /**
   * Last-known backend state for the chat box (relayed by /api/chat-presence).
   * Vast events are point-in-time and the instance sometimes self-recovers
   * (the budget host is known to flap), so a non-"live" stored event is
   * re-verified against llama-server health ground truth before being
   * reported — a passing probe upgrades the state to live. Probe results are
   * cached for BACKEND_PROBE_TTL_MS so heartbeat bursts don't hammer
   * llama-server. Unknown (no event seen yet) → null; UI hides the pill.
   */
  async backendStatus(): Promise<BackendEvent | null> {
    const e = await this.ctx.storage.get<BackendEvent>("backendEvent");
    if (!e) return null;
    if (e.state === "live" && Date.now() - e.at < BACKEND_EVENT_FRESH_MS) return e;

    const now = Date.now();
    if (now - this.backendProbe.at >= BACKEND_PROBE_TTL_MS) {
      let healthy = false;
      try {
        healthy = await llamaHealthy();
      } catch {
        healthy = false;
      }
      this.backendProbe = { at: now, healthy };
    }
    if (this.backendProbe.healthy) {
      const live: BackendEvent = { state: "live", detail: "instance online", notifType: "health_probe", at: now };
      await this.ctx.storage.put("backendEvent", live);
      return live;
    }
    return e;
  }

  private backendProbe: { at: number; healthy: boolean } = { at: 0, healthy: false };

  async beginStream(userId: string): Promise<void> {
    await this.ctx.storage.put(`${LEASE_PREFIX}${userId}`, Date.now() + STREAM_LEASE_TTL_MS);
    await this.touchActivity();
  }

  async renewStream(userId: string): Promise<void> {
    const key = `${LEASE_PREFIX}${userId}`;
    const existing = await this.ctx.storage.get<number>(key);
    if (existing !== undefined) {
      await this.ctx.storage.put(key, Date.now() + STREAM_LEASE_TTL_MS);
    }
  }

  async endStream(userId: string): Promise<void> {
    await this.ctx.storage.delete(`${LEASE_PREFIX}${userId}`);
  }

  /** Idle stop. Alarms fire even with zero traffic. */
  async alarm(): Promise<void> {
    const now = Date.now();

    // Sweep expired leases, count the live ones.
    let liveLeases = 0;
    for (const [key, expiresAt] of await this.ctx.storage.list<number>({ prefix: LEASE_PREFIX })) {
      if (expiresAt > now) liveLeases++;
      else await this.ctx.storage.delete(key);
    }

    const last = await this.ctx.storage.get<number>("lastActivityAt");
    if (last === undefined) return; // nothing to arm against

    const decision = decideAlarmAction({
      now,
      lastActivityAt: last,
      liveLeaseCount: liveLeases,
      idleTimeoutMs: idleTimeoutMs(),
    });

    if (decision.action === "rearm") {
      await this.ctx.storage.setAlarm(decision.alarmAt);
      return;
    }

    try {
      await stopPod();
      // Business-level event for the Honeycomb board: instance is now down,
      // resuming costs a cold-start warmup (see pod.warmup_* events).
      track("pod.idle_stopped", { "app.pod.idle_seconds": Math.round((now - (last ?? now)) / 1000) });
      logger.info("pod stopped after idle timeout");
    } catch (e) {
      if (isConflict(e)) {
        // Already stopped (e.g. raced a concurrent stop) — success.
        logger.debug("idle stop: pod already stopped (409)");
      } else {
        logger.error("idle stop: stopPod failed; retrying in 60s", { error: (e as Error).message });
        await this.ctx.storage.setAlarm(now + 60_000);
        return;
      }
    }
    await this.ctx.storage.delete("statusCache");
  }
}