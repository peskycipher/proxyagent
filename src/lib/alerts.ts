import { LEVEL_ORDER, addSink, type LogLevel } from "@/lib/logger";

/**
 * Webhook alerting sink — ships warn/error log events to ALERT_WEBHOOK_URL as
 * a generic JSON POST (works with any receiver; format for Slack/Discord by
 * pointing the URL at a small relay, or a Cloudflare Worker in front).
 *
 *   ALERT_WEBHOOK_URL   target for alert POSTs (unset = console-only logging)
 *   ALERT_MIN_LEVEL     minimum level to alert on (default: "warn")
 *   ALERTS_PER_MINUTE   send-rate cap (default: 20) — an incident that logs
 *                       heavily must not turn into a webhook flood
 *
 * Alerting is strictly additive: the console JSON lines keep flowing.
 */

export type AlertEvent = { ts: string; level: LogLevel; message: string; fields?: Record<string, unknown> };

function parseLevel(v: string | undefined): LogLevel | null {
  return v === "debug" || v === "info" || v === "warn" || v === "error" ? v : null;
}

/** POST one alert event. Resolves even on failure (alerting must not block). */
export async function sendAlert(url: string, event: AlertEvent): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(event),
      signal: AbortSignal.timeout(10_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Install the alerting sink. Call once at server startup (instrumentation
 * register). No-op when ALERT_WEBHOOK_URL is unset — console logging always
 * continues regardless.
 */
export function installAlertSink(): void {
  const url = process.env.ALERT_WEBHOOK_URL;
  if (!url) return;
  const minLevel = parseLevel(process.env.ALERT_MIN_LEVEL) ?? "warn";
  const cap = Number(process.env.ALERTS_PER_MINUTE) || 20;

  let windowStart = Date.now();
  let sent = 0;
  let dropped = 0;

  addSink((level, message, fields) => {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[minLevel]) return;
    // One-minute fixed window, reset in place.
    const now = Date.now();
    if (now - windowStart >= 60_000) {
      windowStart = now;
      sent = 0;
      dropped = 0;
    }
    if (sent >= cap) {
      dropped++;
      // Surface the drop itself (outside the cap) so muting stays visible.
      if (dropped % 20 === 1) {
        void sendAlert(url, {
          ts: new Date().toISOString(),
          level: "warn",
          message: `alert rate cap hit — ${dropped} events dropped in this window`,
        });
      }
      return;
    }
    sent++;
    void sendAlert(url, { ts: new Date().toISOString(), level, message, ...fields });
  });
}