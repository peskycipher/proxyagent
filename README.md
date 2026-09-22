# proxy-agent

Metered, uncensored LLM chat service. Next.js App Router + SQLite + CryptAPI crypto payments, proxying to a llama.cpp `llama-server` on a Runpod pod (started on demand, auto-stopped after idle).

## How it works

- **Auth**: email+password (scrypt), Auth.js (next-auth v5) JWT sessions. `/chat` and `/portal` require login.
- **Billing**: prepaid time-credit balance in seconds. Every chat request debits actual wall-clock model time (min 1s), atomically, with an append-only audit ledger. Per-user lock — no parallel streams on one account.
- **Pricing**: $1.06/h (2 × Runpod $0.53/h). Tiers: 1h $1.06 · 3h $3.02 (−5%) · 6h $5.72 (−10%) · 12h $10.81 (−15%).
- **Payments**: CryptAPI hosted gateway. `POST /api/purchases` creates a pending purchase + payment address; the signed webhook at `/api/webhooks/gateway/<GATEWAY_WEBHOOK_SECRET>` confirms and credits. Underpayments (vs block price, 2% tolerance) are marked `underpaid` and not credited.
- **Pod automation**: first chat request ensures the pod is running (`POST /v2/pods/{id}/action` start) and polls `llama-server /health`; an idle stopper halts the pod after `POD_IDLE_TIMEOUT_SECONDS` (default 10 min).
- **Security**: pod URL, Runpod key and gateway secret are server-side only; webhook RSA-SHA256 signature verified; credits never float (integer seconds); balance can never go negative (transactional debit).

## Setup

```bash
npm install
cp .env.example .env   # fill in values
npm run dev            # http://localhost:3000
npm test               # unit tests
```

Required env: `AUTH_SECRET` (openssl rand -hex 32), `RUNPOD_API_KEY`, `RUNPOD_POD_ID`, `LLAMA_SERVER_URL`, `GATEWAY_WEBHOOK_SECRET`, `BASE_URL`, `CRYPTAPI_WALLETS_<COIN>` per accepted coin.

## Webhook testing locally

CryptAPI must be able to reach your dev machine: run behind a tunnel (e.g. `cloudflared tunnel --url http://localhost:3000`) and set `BASE_URL` to the tunnel URL.

## API

| Route | Auth | Purpose |
|---|---|---|
| `POST /api/auth/signup` | – | create account |
| `GET /api/me` | ✓ | balance |
| `POST /api/purchases` | ✓ | create charge `{hours, coin}` |
| `GET /api/purchases/:id` | ✓ | purchase status |
| `GET /api/webhooks/gateway/:secret` | signature | CryptAPI callback (responds `*ok*`) |
| `POST /api/chat` | ✓ | SSE stream `{chatId?, message}`; events: `status`, `chat_meta`, `token`, `done`, `error` |
| `GET /api/chats`, `GET /api/chats/:id` | ✓ | chat history |