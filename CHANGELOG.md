# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Portal**
  - Display-currency selector (USD/EUR/GBP/CAD/JPY/AUD/CHF/CNY/INR) above the tier grid; tier prices, payment-panel price line and the new locked equivalent field all re-render in the selected currency via CryptAPI's convert endpoint (new session-gated `/api/fx`, per-currency rate cache, USD fallback while loading/unavailable).
  - Payment panel: a locked (read-only) field below "Amount to transfer" shows the transaction equivalent in the selected currency, marked with a nerd-fonts `cod-lock` SVG.

- **Chat & billing (review fixes)**
  - Streaming stop-loss: a chat stream can never bill more than the balance held when the model request began — the upstream read is aborted at that point and actual usage is billed, so accounts can no longer overdraft (previously the end-of-stream debit threw and was skipped, leaving free overage).
  - Model-context budget: chat history sent to the model is capped (default last 40 messages / 24k chars; `CHAT_HISTORY_MAX_MESSAGES`, `CHAT_HISTORY_MAX_CHARS`), newest-wins, current message always kept.

### Fixed

- Login form: `?next=` is validated to path-form only (`lib/safe-next.ts`) before use in `router.push` and OAuth `callbackUrl`, closing a post-auth open redirect (absolute/protocol-relative URLs fall back to `/portal`).

- **Payments (CryptAPI best-practice gaps closed)**
  - Optional sender-IP allowlist for the gateway webhook (`CRYPTAPI_ALLOWED_IPS`; documented IPs 51.77.105.132 / 135.125.112.47). Off by default so IP rotation can't drop webhooks; signature verification stays the primary gate.
  - Underpayment/expiry now surfaces to the customer: portal shows a warning banner when a pending purchase settles as `underpaid` or `expired`, instead of silently closing the payment panel.
  - Underpaid confirmations emit an ops alert through the logger/alert-sink with coin, expected vs received USD.
  - Portal payment panel icons migrated to nerd-fonts SVG symbols (`cod-warning` asset in `public/icons/`).
### Added

- **Chat**
  - Delete chat threads from the sidebar: hover trash icon (nerd-fonts `cod-trash` SVG) deletes immediately on click, no confirmation dialog.
  - `DELETE /api/chats/[id]` removes the chat and its messages atomically, owner-checked.
  - Deletion is disabled while a stream is in flight to avoid racing its writes.

## [0.1.0] — 2026-09-27

Initial release: a ChatGPT-style proxy-agent web app on Next.js 16, deployed to
Cloudflare Workers (OpenNext), with crypto-denominated pay-as-you-go billing and
RunPod-backed model serving.

### Added

- **Auth**
  - next-auth v5 credentials auth (scrypt password hashing) with edge middleware route protection.
  - OAuth SSO (GitHub, Google) with provider logos on the login/signup buttons.
  - Verified-email enforcement: unverified OAuth emails are denied with a distinct user-visible error.
  - OAuth account linking gated on provider-verified emails.
  - Cloudflare Turnstile captcha on login and signup; middleware migrated to proxy-based execution.

- **Billing & payments**
  - CryptAPI payment gateway client with purchase lifecycle and idempotent confirmation, signature-verified webhooks (POST).
  - Pricing tiers 12/24/72/120 h at $1.59/h with tier discounts.
  - Atomic credits service: debit and purchase confirmation are atomic under D1, with a gross-underpayment guard and a minimum-amount check.
  - Portal payment panel: crypto coin picker with SVG icons and selected-state ring, Tron-red TRC-20 USDT, converted-coin amount display, deposit address with copy button ("Copied!" feedback) and side-by-side QR code.
  - `/me` endpoint.

- **Model serving & chat**
  - RunPod REST v2 client with pod warmup and idle auto-stop; handles `ERROR`/`EXITED` pod transitions.
  - Metered SSE chat proxy: debit on stream end, pod warmup events surfaced to the client.
  - Distributed per-user streaming lock (D1 TTL row + heartbeat) replacing the per-isolate in-memory set.
  - Billing starts at model request; pod warmup is free for users.

- **Observability**
  - Structured logger with pluggable sink; route lock, stream, webhook and pod logs route through it.
  - Webhook alert sink (`ALERT_WEBHOOK_URL`) with rate cap, wired via Next.js instrumentation.

- **UI**
  - Full UI: marketing pages, auth pages, portal with crypto purchase flow, ChatGPT-style chat.
  - Responsive buy panel (tier button grid, full-width buy button, vertically stacked layout).
  - Form accessibility: `id`/`name` + `autocomplete` on login, signup and chat fields.

- **Legal & docs**
  - NSW-tailored privacy policy and terms.
  - Project documentation under `docs/`.

### Fixed

- Gateway callback URL malformed — `BASE_URL` moved to wrangler vars (`https://proxyagent.rent`).
- Network-qualified CryptAPI tickers (`trc20_usdt` → `trc20/usdt`) and surfaced gateway error bodies; SOL mapped to `sol/sol` token path.
- RunPod v2 client uses the `status` field (verified against the live API).
- OAuth review follow-ups: `/user/emails` dedupe, `next` param preserved on deny, `AccessDenied` message handling.
- Solana SVG icon on the portal; icon coverage extracted into a testable module.

### Technical

- Dual-driver database design: Cloudflare D1 in production, better-sqlite3 locally.
- SQLite schema with users, credits and purchase tables; real D1 `database_id` configured.

[Unreleased]: https://github.com/peskycipher/proxyagent/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/peskycipher/proxyagent/releases/tag/v0.1.0