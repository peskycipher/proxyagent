# Implementation Plan: Metered LLM Chat Service ("proxy-agent")

Date: 2026-09-22
Status: Approved design, pending execution

## Spec (decided)

| Decision | Choice |
|---|---|
| Stack | Next.js App Router (TypeScript), single deploy |
| Auth | next-auth v5 beta (Auth.js), credentials (email+password), JWT sessions |
| DB | SQLite via better-sqlite3, single file `data/app.db` |
| Payments | Crypto via hosted gateway with webhook (CryptAPI 0.76 / NOWPayments 0.24 — confirm-band, operator to confirm) |
| Pricing | $1.06/h (2 × Runpod $0.53/h). Tiers: 1h 100% = $1.06 · 3h 95% = $3.02 · 6h 90% = $5.72 · 12h 85% = $10.81 |
| Credits | Prepaid seconds balance; decremented per-request by wall-clock model time; atomic, never negative |
| Model | llama.cpp `llama-server` on Runpod pod — OpenAI-compatible `/v1/chat/completions` |
| Pod mode | On-demand: start via Runpod REST on first request, auto-stop after idle timeout (~10 min) |
| UI | ChatGPT-style chat at `/chat`, portal at `/portal` — both behind auth middleware |

## Security invariants

1. Pod endpoint URL + llama.cpp API key (if set) + Runpod API key live **only** in server env vars. Never sent to browser.
2. Every chat request: session check → balance check → server-side metering. The browser only ever talks to our Next.js server.
3. Webhook endpoint validated by secret path segment + signature before crediting.
4. Passwords hashed with `node:crypto` scrypt (no extra dependency).
5. Per-user serialization lock: one in-flight chat request per user; concurrent requests rejected (prevents double-burn / negative balance races).
6. All request bodies validated with zod.

## Data model (SQLite)

```sql
users(id TEXT PK, email TEXT UNIQUE, password_hash TEXT, balance_seconds INTEGER NOT NULL DEFAULT 0, created_at INTEGER)
purchases(id TEXT PK, user_id TEXT FK, gateway_ref TEXT, coin TEXT, address TEXT, seconds INTEGER, amount_usd_cents INTEGER, status TEXT CHECK(status IN ('pending','confirmed','expired')), created_at INTEGER, confirmed_at INTEGER)
credit_txns(id TEXT PK, user_id TEXT FK, delta_seconds INTEGER NOT NULL, reason TEXT NOT NULL, ref TEXT, created_at INTEGER)  -- append-only ledger
chats(id TEXT PK, user_id TEXT FK, title TEXT, created_at INTEGER)
messages(id TEXT PK, chat_id TEXT FK, role TEXT, content TEXT, billed_seconds INTEGER, created_at INTEGER)
```

Balance is denormalized on `users.balance_seconds` for atomic check-and-debit inside a better-sqlite3 transaction; `credit_txns` is the audit ledger (balance must always equal SUM(delta)).

## Verified dependencies

Verified against registry.npmjs.org 2026-09-22 (all active, MIT):

```
npm install next@16.3.5 react react-dom
npm install -D typescript @types/node @types/react better-sqlite3@13.0.3 @types/better-sqlite3
npm install next-auth@5.0.0-beta.32 zod@4.6.5
```

No other runtime deps: Runpod REST + CryptAPI REST via plain `fetch`; scrypt via `node:crypto`; SSE via native `ReadableStream`.

## Tasks (bite-sized, TDD order)

1. **Scaffold** — `create-next-app` equivalents: Next 16 + TS + ESLint, install verified deps, `data/` gitignored, `lib/db.ts` singleton (better-sqlite3, WAL mode).
2. **Pricing module (TDD red→green)** — `lib/pricing.ts`: `PRICE_PER_HOUR_USD=1.06`, `TIERS=[{hours:1,discount:0},{hours:3,discount:.05},{hours:6,discount:.10},{hours:12,discount:.15}]`; `priceUsdCents(hours)` and `secondsForBlock(hours)` pure functions. Tests assert all 4 tier prices exactly (106, 302, 572, 1081 cents) and no rounding drift. Commit `feat: pricing module`.
3. **Schema + migrations** — `lib/schema.ts` idempotent DDL; users/credit_txns invariants test (balance === SUM(delta) after arbitrary sequences). Commit.
4. **Credits service (TDD)** — `lib/credits.ts`: `credit(userId, delta, reason, ref)` and `debit(userId, delta, reason, ref)` in a transaction; debit throws when it would go negative; concurrent debit test proves no negative balance. Commit.
5. **Auth** — `auth.ts` (next-auth v5, Credentials provider, scrypt verify via `lib/passwords.ts`), `middleware.ts` protecting `/chat`, `/portal`, `/api/chat`, `/api/purchases`; `/` = marketing + login/signup. Commit.
6. **Purchase + gateway client (TDD with mocked HTTP)** — `lib/gateway.ts`: `createCharge({seconds, coin})` → gateway address; `verifyCallback(req)` secret-path + signature check. `POST /api/purchases` (creates pending purchase + charge), `POST /api/webhooks/gateway/<secret>` (idempotent confirm → credit seconds + txn row). Commit.
7. **Portal UI** — `/portal`: balance display (formatted h:mm:ss), 4 tier buy buttons → coin picker → address + QR + poll status. Commit.
8. **Runpod client** — `lib/runpod.ts`: `getPod(id)`, `startPod(id)`, `stopPod(id)` via `fetch(process.env.RUNPOD_API_BASE, {Authorization: Bearer RUNPOD_API_KEY})`. ⚠️ Verify exact REST v2 paths + auth header against the runpod-migrate skill / live API at execution time before implementing. Idle-stopper: timestamp of last request in memory/DB; a `setInterval` in the server singleton stops the pod after `IDLE_TIMEOUT_SECONDS=600`. Commit.
9. **Metered proxy (TDD for metering logic)** — `lib/meter.ts`: wall-clock timer wrapper (start on request, stop on stream end, returns seconds, min billable 1s). `POST /api/chat`: zod-validate → per-user lock (Map<userId, Promise>) → ensure pod running (await `startPod` + poll llama-server `/health`, emit SSE `status: warming` events meanwhile) → balance ≥ 1s check → fetch upstream `/v1/chat/completions` (stream:true) → pipe SSE to client, on close: debit(seconds), append message rows. Commit.
10. **Chat UI** — `/chat`: ChatGPT-style (sidebar of chats, streaming render via EventSource/fetch-SSE reader, markdown-lite rendering, "warming up…" indicator). Chat list + history from DB. Commit.
11. **Config + docs** — `.env.example` (AUTH_SECRET, RUNPOD_API_KEY, RUNPOD_POD_ID, LLAMA_SERVER_URL, GATEWAY_API_KEY?, GATEWAY_WEBHOOK_SECRET, BASE_URL), README with setup + CryptAPI account notes + pricing table. Commit.

## Verification gate (before "done")

- `npm test` — pricing, credits, meter, webhook-signature unit tests all green.
- Manual E2E: sign up → portal shows 0 balance → (test-mode charge if available) → webhook → balance credited → chat streams → seconds debited matches stream duration → second concurrent chat request rejected → idle timeout stops pod (verify via Runpod API) → logout blocks /chat.
- `graft build` to refresh the repo graph after implementation.

## Open items (operator)

- Confirm gateway: CryptAPI (lean, 0.76 p but 0.52 confidence — confirm band) vs NOWPayments.
- Provide: Runpod pod ID + API key, llama-server URL on pod, which coin(s) to accept.
- CryptAPI/NOWPayments webhook delivery to local dev requires a tunnel (ngrok/cloudflared) during testing.