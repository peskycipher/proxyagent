# No hardcoded secrets
Source code must not contain passwords, API keys, tokens, or connection URLs with credentials.
Read them from the environment, a function parameter, or the config module.

# Comments explain why, not what
A comment states a reason, a constraint, a workaround, or a non-obvious invariant. A comment
that restates what the next line plainly does is a violation.

# Errors are not swallowed
A `catch` block must handle the error, report it, or re-raise it. An empty catch block, or
one whose body is only a comment, is a violation.

# No partial implementations
Implement features fully. A comment that says "for now", "simplified", or "later", or a
stub body, is a violation. If a part genuinely cannot be done, say so in your reply instead
of stubbing it.

# Do not run destructive commands that erase uncommitted work
`git reset --hard`, `git checkout -- .`, `git clean -fd`, and similar commands that discard
untracked or uncommitted changes are forbidden. These destroy work that has no backup. If a
clean tree is needed, create a worktree instead or ask the user.

# Auth gates protected routes
`/chat` and `/portal` require a logged-in session. New protected pages or API routes must be
covered by the existing middleware/auth check, never left unauthenticated. Users authenticate
with email+password (scrypt) via Auth.js (next-auth v5) JWT sessions.

# Billing debits atomically with an append-only ledger
Every chat request debits actual wall-clock model time (minimum 1 second) from the prepaid
balance, atomically, with an entry in the append-only audit ledger. A per-user lock prevents
parallel streams on one account. Balance can never go negative.

# Credits are integer seconds, never floating point
All time-credit amounts in billing, ledger entries, and API responses are integers in seconds.
No fractional or floating-point credit math anywhere in the codebase.

# Pricing follows the fixed tariff
Metered rate is $1.06/h (2 × Runpod $0.53/h). Time tiers: 1h $1.06 · 3h $3.02 (−5%) ·
6h $5.72 (−10%) · 12h $10.81 (−15%). Do not hardcode different prices elsewhere; import them
from the pricing module.

# Payments go through CryptAPI hosted gateway
`POST /api/purchases` creates a pending purchase and payment address; the signed webhook at
`/api/webhooks/gateway/<GATEWAY_WEBHOOK_SECRET>` confirms the payment and credits the account.
Underpayments (versus block price, 2% tolerance) are marked `underpaid` and are not credited.

# Webhook signatures are verified
The gateway webhook at `/api/webhooks/gateway/[secret]` must verify the CryptAPI RSA-SHA256
signature before processing. Requests failing verification are rejected, never credited.

# Secrets stay server-side only
The pod URL, Runpod API key, gateway secret, and `AUTH_SECRET` must never be exposed to the
client. They are read from the environment in server-only modules and never sent in API
responses, props, or client bundles.

# Pod automation: ensure running before first chat, stop after idle
The first chat request ensures the pod is running (`POST /v2/pods/{id}/action` start) and
polls `llama-server /health` before streaming. An idle stopper halts the pod after
`POD_IDLE_TIMEOUT_SECONDS` (default 10 minutes). Do not bypass this lifecycle with direct
static pod URLs.

# Configuration comes from environment, never committed
Required env vars: `AUTH_SECRET` (openssl rand -hex 32), `RUNPOD_API_KEY`, `RUNPOD_POD_ID`,
`LLAMA_SERVER_URL`, `GATEWAY_WEBHOOK_SECRET`, `BASE_URL`, and `CRYPTAPI_WALLETS_<COIN>` per
accepted coin. `.env` is never committed; `.env.example` documents the variables.

# Local webhook testing uses a tunnel
CryptAPI callbacks must reach the dev machine: run behind a tunnel (e.g.
`cloudflared tunnel --url http://localhost:3000`) and set `BASE_URL` to the tunnel URL.
paths: docs/**, README.md

# No explicit any
Do not use the explicit `any` type anywhere in TypeScript files.
paths: **/*.ts, **/*.tsx

# Exported functions declare return types
Every exported function declares its return type explicitly.
paths: src/**/*.ts
