import { logger } from "@/lib/logger";

/**
 * Business-level telemetry events — the single helper for `app.*` metrics.
 *
 * Events go out as structured JSON through the logger; Cloudflare's Workers
 * Logs OTLP export delivers them to Honeycomb, which parses JSON bodies into
 * queryable columns. Chat completion / billing, purchases, pod warmup, and
 * auth events are all queryable with `app.event = <name>`.
 *
 * Do not log PII (emails, message content) through this channel.
 */
export function track(event: string, fields: Record<string, unknown> = {}): void {
  logger.info(event, { "app.event": event, ...fields });
}