# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Backend instance pill (chat box ↔ vast.ai webhook linkage)**: lifecycle notifications from the vast.ai webhook (started/stopped/offline/deleted/error) are now mapped and stored in the `PodController` DO (`src/lib/vast-events.ts` → webhook receiver → DO), and the existing 10s presence heartbeat returns them as `backend` so the chat box shows a live status pill above the message list — green "Backend online", amber "Backend idle — your next message starts it", red "Backend error". A non-live state is health-verified against llama-server (20s probe cache) before display, since the budget host is known to self-recover; a passing probe upgrades the pill to online. Ops-only event types (low_credit, billing_failed, outbid…) stay out of the UI, and account-wide webhook events naming another instance id are ignored.

- **Profile settings (chat sidebar avatar menu → Profile settings)**
  - Avatar: upload a picture (client-resized to 128px, stored as a data URL) or use the linked Google/GitHub account's photo as fallback (GitHub avatars are also synthesized from the numeric account id when no URL is stored). ✕ / Remove reverts to the letter avatar.
  - Public username: unique (case-insensitive), 2–32 chars (`[A-Za-z0-9_-]`); empty clears it (`POST /api/me/username`, 409 on conflict).
  - Linked accounts: Google/GitHub link/unlink — explicit link flow via a short-lived link-intent cookie, gated on a verified provider email; one provider identity can bind to at most one profile. Unlinking the last remaining sign-in method requires confirming the password. Legacy sessions (minted before the feature) self-heal their missing row — and backfill the provider picture — from the OAuth identity carried on the token.
  - Theme: light/dark toggle, persisted to `localStorage`, applied before first paint (no flash).

- **In-chat purchases**: the portal's "Buy time credits" card is extracted into a shared `PurchaseCard` (tier grid, display-currency selector, coin picker, QR + address + copy buttons, 5s settle polling, underpaid/expired banner) rendered in a modal on the chat page — countdown click or low-balance banner button opens it. Balance updates live in the sidebar countdown and portal Chat button on settle, without leaving the thread.

- **Countdown section (chat sidebar)**: time-left display moved into its own ~2/3-height section above the profile block; clicking opens the buy-credits modal. Formatter ladder: `s → m → h → d (>23h) → mo (30d) → y (365d)`, e.g. `90,000,000s → 2y 10mo 11d 16h 0m 0s`.

- **Low-balance banner (<15 min)**: full-width bar at the top of the chat container with an amber warning triangle, a live per-second countdown (bold 18px), and a Purchase button opening the in-chat modal (dismiss once per session). Countdown turns red at the threshold.

### Changed

- **New model backend: `https://llama.proxyagent.rent`** (Cloudflare Tunnel in front of vast.ai instance 54266365, Qwen3.8 27B Uncensored Mythos Agentic Q4_K_M on 2×5090). The tunnel hostname is DNS-stable across stop→start IP churns — the worker keeps using it verbatim instead of re-learning the pod IP (`tunnelMode` in `src/lib/vast.ts`). Config is entirely Worker secrets: `LLAMA_SERVER_URL`, `LLAMA_API_KEY`, `LLAMA_MODEL_ID` (exact `--alias`: `Qwen3.8 27B Uncensored Mythos Agentic Q4_K_M`), and `VAST_INSTANCE_ID` repointed to 54266365 so the start-on-demand/idle-stop lifecycle follows the new box.
- Thinking visibility: the new box serves Qwen3 with thinking enabled (`--reasoning-effort xhigh`), so replies open with minutes of `reasoning_content` deltas before the first visible token. `/api/chat` now shows a "model is thinking" status line once reasoning starts and clears it ("ready") when visible content resumes — previously the wait was silent, metered time. Reasoning deltas are never persisted into assistant messages.
- Vast error teardown telemetry: `pod.vast_error_seen` now tags `app.pod.machine_id` with the host's actual machine id (fetched per instance) instead of the hardcoded old host "27389", so the Honeycomb series follows the rented box.

- Chat sidebar: Portal/Sign-out moved into buttons; portal `Chat` button is blue when credits remain (>1s) and light grey + disabled at ≤1s.
- `chat-client.tsx` split into focused components (`MessageList`, `Composer`, `ProfilePanel`, `ProfileSettingsModal`, plus shared `types.ts`); its inline styles moved to CSS classes.
- Shared helpers: `requireUser()`/`unauthorized()` route guards (all API routes), `jsonSafe()` defensive JSON parsing.
- `linked_accounts` now also stores the provider picture (`provider_picture`) with a self-healing backfill, and the deprecated `React.FormEvent` uses were migrated to `SubmitEvent`.

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