/**
 * Best-effort ops email notifications over the Cloudflare Email Service
 * `send_email` binding (docs: developers.cloudflare.com/email-service).
 *
 * The NOTIFY_OPS binding in wrangler.jsonc carries `destination_address:
 * "payments@proxyagent.rent"`, so the Worker can only ever send to that one
 * verified destination — no recipient is taken from caller input, and sends
 * to verified destinations are free on all Cloudflare plans.
 *
 * Notification is never allowed to break payment processing: a missing
 * binding (local dev) resolves silently and a failing send is logged, not
 * thrown. The webhook handler still answers CryptAPI's literal "*ok*".
 */

export interface PaymentEmailMsg {
  purchaseId: string;
  coin: string;
  /** Seconds of chat time credited. */
  seconds: number;
  /** Purchase price in USD cents. */
  amountUsdCents: number;
}

/** Minimal shape of the Workers send_email binding (avoids a types dep). */
export interface EmailBinding {
  send(msg: { from: string; subject: string; html: string; text: string }): Promise<unknown>;
}

const FROM = "noreply@proxyagent.rent";

function usd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function hoursLabel(seconds: number): string {
  return `${(seconds / 3600).toFixed(seconds % 3600 === 0 ? 0 : 2)}h`;
}

function body(msg: PaymentEmailMsg): { subject: string; text: string; html: string } {
  const subject = `Payment confirmed: ${hoursLabel(msg.seconds)} of chat time (${usd(msg.amountUsdCents)} in ${msg.coin.toUpperCase()})`;
  const text = [
    `Crypto payment confirmed.`,
    ``,
    `Credited: ${hoursLabel(msg.seconds)} of chat time`,
    `Paid: ${usd(msg.amountUsdCents)} in ${msg.coin.toUpperCase()}`,
    `Purchase: ${msg.purchaseId}`,
  ].join("\n");
  const html = [
    `<p>Crypto payment confirmed.</p>`,
    `<ul>`,
    `<li>Credited: <strong>${hoursLabel(msg.seconds)}</strong> of chat time</li>`,
    `<li>Paid: <strong>${usd(msg.amountUsdCents)}</strong> in ${msg.coin.toUpperCase()}</li>`,
    `<li>Purchase: <code>${msg.purchaseId}</code></li>`,
    `</ul>`,
  ].join("\n");
  return { subject, text, html };
}

/**
 * Send a payment-confirmation notification. `binding` defaults to the
 * NOTIFY_OPS Worker binding; inject a stub in tests. Never throws.
 */
export async function sendPaymentEmail(msg: PaymentEmailMsg, binding?: EmailBinding): Promise<void> {
  try {
    let target = binding;
    if (!target) {
      const { getCloudflareContext } = await import("@opennextjs/cloudflare");
      // SAFETY: binding presence is only known at runtime; absent locally.
      target = (getCloudflareContext() as unknown as { env?: { NOTIFY_OPS?: EmailBinding } }).env?.NOTIFY_OPS;
    }
    if (!target) return; // no binding (local dev/tests): skip quietly
    const { subject, text, html } = body(msg);
    await target.send({ from: FROM, subject, text, html });
  } catch (err) {
    const { logger } = await import("@/lib/logger");
    logger.error("payment notification email failed", {
      purchaseId: msg.purchaseId,
      error: (err as Error).message,
    });
  }
}