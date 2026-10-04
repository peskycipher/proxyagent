/**
 * Vast.ai notification → backend-linkage mapping (pure, unit-testable).
 *
 * The chat box must stay linked to the running llama.cpp instance even though
 * the vast.ai on-demand instance changes state underneath it (idle-stops,
 * machine hiccups, restarts). Vast.ai notification webhooks are the only push
 * source for those lifecycle transitions — they arrive at
 * /api/webhooks/vast, are mapped here, and feed the PodController durable
 * object, which the presence heartbeat (/api/chat-presence) relays to the
 * chat box.
 *
 * Mapping rules (docs.vast.ai/notifications/webhooks — event_types come
 * prefixed with "client:", e.g. "client:instance_started"):
 * - instance lifecycle types map to a user-facing backend state;
 * - ops/billing types (low_credit, billing_failed, outbid…) map to null —
 *   they alert ops via the receiver's log sink but never surface to users.
 */

export type BackendState = "live" | "idle" | "error";

export interface BackendEvent {
  state: BackendState;
  /** Fixed one-liner from the mapping; UI overlays its own wording. */
  detail: string;
  /** Vast notif_type without the "client:" prefix (or "health_probe"). */
  notifType: string;
  /** Epoch ms when we learned of it. */
  at: number;
}

const EVENT_STATES: Record<string, { state: BackendState; detail: string }> = {
  instance_started: { state: "live", detail: "instance started" },
  instance_online: { state: "live", detail: "instance online" },
  instance_resumed: { state: "live", detail: "instance resumed" },
  instance_offline: { state: "idle", detail: "instance offline" },
  instance_stopped: { state: "idle", detail: "instance stopped" },
  instance_created: { state: "idle", detail: "instance created" },
  instance_deleted: { state: "error", detail: "instance deleted" },
  error_msgs: { state: "error", detail: "instance error" },
  machine_maintenance: { state: "idle", detail: "machine maintenance" },
};

/** Map a vast notification to a backend event, or null when ops-only. */
export function mapVastEvent(notifType: string, at = Date.now()): BackendEvent | null {
  const key = notifType.replace(/^client:/, "");
  const mapped = EVENT_STATES[key];
  return mapped ? { state: mapped.state, detail: mapped.detail, notifType: key, at } : null;
}

/**
 * Webhooks are account-wide; ignore events that clearly belong to another
 * instance. Detection is best-effort: the payload's id-ish fields first,
 * then "instance <digits>" references in subject/message. With no readable
 * instance reference, the event is assumed to be ours (account webhooks are
 * provisioned for this single llama instance).
 */
export function mentionsOtherInstance(
  payload: { id?: unknown; instance_id?: unknown; subject?: unknown; message?: unknown },
  instanceId: string,
): boolean {
  if (!instanceId) return false;
  const candidates: string[] = [];
  for (const v of [payload.id, payload.instance_id]) {
    if (typeof v === "string" || typeof v === "number") candidates.push(String(v));
  }
  for (const v of [payload.subject, payload.message]) {
    if (typeof v === "string") {
      const m = v.match(/\binstance\s+(\d+)\b/i);
      if (m) candidates.push(m[1]);
    }
  }
  if (candidates.length === 0) return false;
  // None of the identified instances is ours → not for us.
  return candidates.every((c) => c !== instanceId);
}