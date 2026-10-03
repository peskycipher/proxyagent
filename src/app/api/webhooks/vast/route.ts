import { createHmac, timingSafeEqual } from "node:crypto";
import { logger } from "@/lib/logger";

/**
 * Vast.ai notification-webhook receiver (docs.vast.ai/notifications/webhooks).
 *
 * Vast.ai POSTs signed JSON events for subscribed notification types — we use
 * it for instance lifecycle visibility on the on-demand llama.cpp backend
 * (see src/lib/vast.ts): started/stopped/deleted, instance_offline/error_msgs,
 * low_credit, etc. The receiver is audit/alert only: it verifies, logs, and
 * forwards critical events to the ops alert sink (src/lib/alerts.ts). Pod
 * state itself is always re-read from the vast API, never driven from here.
 *
 * Security contract (per the docs):
 * - HMAC-SHA256 over "<X-Vast-Timestamp>.<raw body bytes>" with the webhook
 *   signing secret (only shown at create/rotate time) in X-Vast-Signature-256.
 * - Stale timestamps (>5 min) are rejected (replay window).
 * - Delivery is at-least-once → dedupe on event_id.
 * - Answer 2xx fast once accepted; 408/429/5xx are retried by vast, 3xx/4xx
 *   (except 408/429) are permanent failures. Return 204 — no body, no redirect.
 */

const SIGNATURE_HEADER = "x-vast-signature-256";
const TIMESTAMP_HEADER = "x-vast-timestamp";
const EVENT_ID_HEADER = "x-vast-event-id";
const REPLAY_WINDOW_SECONDS = 300;

/** Events that warrant an ops alert (warn), vs plain audit logging. */
const ALERT_TYPES = new Set([
  "instance_offline",
  "error_msgs",
  "instance_deleted",
  "low_disk_space",
  "storage_full",
  "low_credit",
  "billing_failed",
  "machine_maintenance",
  "outbid",
]);

export function verifyVastSignature(
  headers: Headers,
  rawBody: string,
  secret: string,
): boolean {
  const timestamp = headers.get(TIMESTAMP_HEADER) ?? "";
  const signature = headers.get(SIGNATURE_HEADER) ?? "";
  if (!timestamp || !signature.startsWith("sha256=")) return false;

  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
  if (!Number.isFinite(age) || age > REPLAY_WINDOW_SECONDS) return false;

  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");
  const given = signature.slice("sha256=".length);
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(given, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

// At-least-once delivery: best-effort in-memory dedupe (events are rare; a
// rare duplicate across isolates only causes a duplicate log line).
const seenEvents = new Map<string, number>();
const SEEN_TTL_MS = 10 * 60_000;

function isDuplicate(eventId: string): boolean {
  const now = Date.now();
  for (const [id, at] of seenEvents) {
    if (now - at > SEEN_TTL_MS) seenEvents.delete(id);
  }
  if (seenEvents.has(eventId)) return true;
  seenEvents.set(eventId, now);
  return false;
}

export async function POST(req: Request) {
  const secret = process.env.VAST_WEBHOOK_SECRET;
  if (!secret) {
    // Receiver intentionally disabled — do not leak whether it exists.
    return new Response("not found", { status: 404 });
  }

  const rawBody = await req.text();

  let verified = false;
  try {
    verified = verifyVastSignature(req.headers, rawBody, secret);
  } catch {
    verified = false;
  }
  if (!verified) {
    logger.error("vast webhook signature verification failed", {});
    return new Response("unauthorized", { status: 401 });
  }

  const eventId = req.headers.get(EVENT_ID_HEADER) ?? "";
  if (eventId && isDuplicate(eventId)) {
    return new Response(null, { status: 204 });
  }

  let payload: {
    event_id?: string;
    notif_type?: string;
    subject?: string;
    message?: string;
  } | null = null;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    // Signature held but body malformed — accept (it can't be retried into
    // anything better) and log for forensics.
    logger.error("vast webhook unparseable body", { eventId });
    return new Response(null, { status: 204 });
  }

  const notifType = payload?.notif_type ?? "unknown";
  const subject = payload?.subject ?? "";
  const message = payload?.message ?? "";

  if (ALERT_TYPES.has(notifType)) {
    logger.error("vast event", { notifType, subject, message, eventId });
  } else {
    logger.info("vast event", { notifType, subject, message, eventId });
  }

  // Accepted — answer fast; alerting happens via the logger's alert sink.
  return new Response(null, { status: 204 });
}

export function GET() {
  return new Response("method not allowed", { status: 405 });
}