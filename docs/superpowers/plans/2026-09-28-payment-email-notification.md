# Plan: Email notification on successful crypto payment

Date: 2026-09-28
State: proposed — not yet implemented

## Requirement

When a crypto payment is confirmed (CryptAPI webhook → `confirmPurchase`),
email a notification to **payments@proxyagent.rent** (the app's own domain,
verified in `wrangler.jsonc` BASE_URL).

## Design: Cloudflare Email Service binding (zero dependencies, free)

`jev-scout` was unavailable for library selection (0 candidates, then HTTP
400) — so the plan proposes **no new packages at all**. Delivery uses the
native Workers `send_email` binding (Cloudflare Email Service), verified
against live docs (developers.cloudflare.com/email-service, Jun 2026):

- `destination_address` locks the binding to a single recipient — even a bug
  cannot send anywhere else.
- Sending to verified destination addresses is **free on all plans** and does
  not count against any quota.
- Binding surface: `binding.send({ from, subject, html, text })`; with
  `destination_address` set, `to` may be omitted.

```jsonc
// wrangler.jsonc
"send_email": [{
  "name": "NOTIFY_OPS",
  "destination_address": "payments@proxyagent.rent"
}]
```

## One-time setup outside the code (operator)

1. Onboard proxyagent.rent to Email Service (zone is already on Cloudflare).
2. Add `payments@proxyagent.rent` as a **verified destination address**
   (Email Routing → Destination addresses → confirm the verification link —
   create an Email Routing rule forwarding it to a real inbox so the link and
   future notifications are readable).

## Tasks

### Task 1 — `src/lib/mailer.ts` (TDD Red/Green)

Files: `src/lib/mailer.ts`, `tests/mailer.test.ts`

1. **Red**: tests with an injected stub binding:
   - `sendPaymentEmail(msg, stub)` calls `send()` once with
     `from: "noreply@proxyagent.rent"`, subject containing coin + hours,
     text and html bodies containing amount + seconds.
   - missing/undefined binding → resolves silently (no throw).
   - `send()` rejecting → resolves (logged, never throws).
2. **Green**: implement with the same runtime-probing pattern as `db.ts`
   (`getCloudflareContext().env?.NOTIFY_OPS`), injectable for tests.
3. `npm test` → 0 failures. Commit: `feat: payment notification mailer`.

### Task 2 — Webhook integration (TDD Red/Green)

Files: `src/app/api/webhooks/gateway/[secret]/route.ts`, `tests/mailer.test.ts`

1. **Red**: source-read test asserting the webhook handler calls
   `sendPaymentEmail` after a confirmed `confirmPurchase` result.
2. **Green**: after `confirmPurchase(...)` returns `{ credited: true }`,
   build the notification (purchase id, coin, seconds, USD amount) and
   `await sendPaymentEmail(...)` inside try/catch — the handler must still
   return the literal `*ok*` on email failure (CryptAPI retries non-`*ok*`).
3. `npm test`, `npx tsc --noEmit`. Commit:
   `feat: email payment notification on confirmed webhook`.

### Task 3 — Binding config + final gate

Files: `wrangler.jsonc`

1. Add the `send_email` binding (see design block above).
2. **Verify Green**: `npm test`, `npm run build`. Commit:
   `feat: notify ops binding for payment emails`.

## Validation

- `npm test`, `npx tsc --noEmit`, `npm run build` all green.
- Live-send untestable locally (binding exists only in Workers): the mailer
  degrades to a logged skip when the binding is absent — exact behavior
  verified at first production deploy.

## Risks

- Verified-destination status of payments@proxyagent.rent is an account-side
  prerequisite; until verified, sends fail at the API boundary — logged, never
  blocking payment confirmation.
- `from` must be an address on the onboarded zone; noreply@proxyagent.rent
  chosen as the default sender.