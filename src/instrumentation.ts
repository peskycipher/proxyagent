import type { Instrumentation } from "next";
import { logger } from "@/lib/logger";

/**
 * Observability wiring, run once per server instance before it accepts
 * requests. See https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation
 */
export async function register() {
  // Webhook alerting (no-op when ALERT_WEBHOOK_URL is unset).
  const { installAlertSink } = await import("@/lib/alerts");
  installAlertSink();
}

/** Uncaught server errors → console + alert webhook (when configured). */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  const message = err instanceof Error ? err.message : String(err);
  const digest = typeof err === "object" && err !== null && "digest" in err ? String(err.digest) : undefined;

  logger.error("unhandled server error", {
    message,
    digest,
    path: request.path,
    method: request.method,
    context,
  });

  // Await the delivery: Next.js requires async work here to be awaited.
  const { sendAlert } = await import("@/lib/alerts");
  const url = process.env.ALERT_WEBHOOK_URL;
  if (url) {
    await sendAlert(url, {
      ts: new Date().toISOString(),
      level: "error",
      message: `unhandled server error: ${message}`,
      fields: { digest, path: request.path, method: request.method },
    });
  }
};