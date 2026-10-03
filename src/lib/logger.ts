/**
 * Minimal structured logger — the single place server-side logs flow through.
 * Default sink emits one JSON line per event to the console (visible in
 * `wrangler tail` / Cloudflare dashboards); a custom sink can be plugged in
 * for alerting (Sentry, a webhook, a Tail Worker) without touching call sites.
 *
 *   LOG_LEVEL=debug|info|warn|error   (default: info)
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export { LEVEL_ORDER };

export type LogSink = (level: LogLevel, message: string, fields?: Record<string, unknown>) => void;

const defaultSink: LogSink = (level, message, fields) => {
  // Log a plain object, not a JSON string: Workers Logs extracts object keys as
  // structured attributes, so app.* fields become queryable columns in
  // Honeycomb (via the logs OTLP export). The whole object stays readable in
  // `wrangler tail` and the Cloudflare dashboard.
  const line = { ts: new Date().toISOString(), level, message, ...fields };
  // error/warn surface in tail with error semantics; info/debug as plain output.
  if (LEVEL_ORDER[level] >= LEVEL_ORDER.warn) {
    console.error(line);
  } else {
    console.log(line);
  }
};

let minLevel = parseLevel(process.env.LOG_LEVEL) ?? "info";
let sink: LogSink = defaultSink;

function parseLevel(v: string | undefined): LogLevel | null {
  return v === "debug" || v === "info" || v === "warn" || v === "error" ? v : null;
}

/** Reconfigure the logger (e.g. install an alerting sink at startup). */
export function configureLogger(opts: { level?: LogLevel; sink?: LogSink }): void {
  if (opts.level) minLevel = opts.level;
  if (opts.sink) sink = opts.sink;
}

/**
 * Add a sink alongside the existing ones (e.g. the alerting webhook sink on
 * top of the console sink). Returns a remover for tests.
 */
export function addSink(extraSink: LogSink): () => void {
  const prev = sink;
  sink = (level, message, fields) => {
    prev(level, message, fields);
    try {
      extraSink(level, message, fields);
    } catch {
      // A broken sink must never take down the request path.
      console.error(JSON.stringify({ ts: new Date().toISOString(), level, message }));
    }
  };
  return () => {
    sink = prev;
  };
}

function emit(level: LogLevel, message: string, fields?: Record<string, unknown>): void {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[minLevel]) return;
  try {
    sink(level, message, fields);
  } catch {
    // A broken sink must never take down the request path.
    console.error(JSON.stringify({ ts: new Date().toISOString(), level, message }));
  }
}

export const logger = {
  debug: (message: string, fields?: Record<string, unknown>) => emit("debug", message, fields),
  info: (message: string, fields?: Record<string, unknown>) => emit("info", message, fields),
  warn: (message: string, fields?: Record<string, unknown>) => emit("warn", message, fields),
  error: (message: string, fields?: Record<string, unknown>) => emit("error", message, fields),
};