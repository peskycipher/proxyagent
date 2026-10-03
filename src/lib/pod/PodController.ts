import { DurableObject } from "cloudflare:workers";
import { getPod, startPod, stopPod, isConflict, llamaHealthy } from "./backend";
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