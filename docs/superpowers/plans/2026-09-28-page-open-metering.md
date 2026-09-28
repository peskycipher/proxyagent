# Plan: Page-open chat metering

Date: 2026-09-28
State: proposed — not yet implemented

## Requirement

While `/chat` is open, balance ticks down per second of wall-clock time
(parking-meter model), not only during model streams. At zero: the client
redirects to `/portal` and stops; the portal Chat button is disabled at 0.

## Design decisions

- **Server-authoritative, DB-clock.** New `users.open_billed_at` column (ms).
  A heartbeat is one atomic `UPDATE users SET open_billed_at = ? WHERE id = ?
  RETURNING open_billed_at` — old value → elapsed seconds → guarded `debit`.
  Survives multiple Worker isolates (in-memory maps cannot be trusted here).
- **Presence = fresh heartbeat.** Active while a heartbeat arrived ≤ 30 s ago.
  No explicit open/close protocol needed; tab close / sleep = heartbeat stops.
- **Catch-up cap.** Each heartbeat debits at most 60 s of elapsed time, so
  sleeping/laptop-lid time never burns more than a minute.
- **No double-billing with stream metering.** While a model stream runs for
  the user (shared in-memory `inFlight`-style flag in `chat-presence.ts`),
  heartbeats skip debiting and do not advance the clock; stream cleanup
  resumes the clock at now() after the stream's own billed seconds are
  debited. (Known limitation: flag is per-isolate — same trade-off as the
  existing `inFlight` lock; DB timestamps remain the source of truth.)
- **Idle vs stream boundary**: billing is wall-clock from open_billed_at;
  every billing path (heartbeat or stream) ends with `debit`, ledger intact.
- **No new dependencies** — pure module + API + CSS-level UI change, so
  `jev-scout` dependency verification is not applicable.

## Tasks

### Task 1 — `chat-presence.ts` core (TDD Red/Green)

Files: `src/lib/chat-presence.ts`, `tests/chat-presence.test.ts`

1. **Red**: unit tests with an injected `now()`:
   - `openTick(userId, now)`: first call seeds clock (0 billed), returns balance.
   - elapsed 12 s → debits 12 (round up, min 1); elapsed 0 → no debit.
   - catch-up elapsed 200 s → debits exactly 60 (cap).
   - while `streamActive(userId)` → no debit, clock not advanced.
   - `pauseStream(userId)` / `resumeStream(userId, now)`: resume sets
     open_billed_at forward (clock restarts, stream time not double-charged).
2. **Green**: implement with `getDb()`, guarded `debit` reuse, module-level
   `Set` for active streams. `npm test` → 0 failures.
3. Commit: `feat: chat-presence billing core`.

### Task 2 — DB migration + presence API

Files: `src/lib/db.ts`, `src/app/api/chat-presence/route.ts`,
`tests/chat-presence.test.ts`

1. **Red**: test asserts schema migration adds `open_billed_at` and POST
   route module exports a handler.
2. **Green**:
   - `MIGRATIONS.push("ALTER TABLE users ADD COLUMN open_billed_at INTEGER")`.
   - `POST /api/chat-presence`: auth → `openTick(userId)` →
     `{ balanceSeconds }` on 200; `402 { balanceSeconds: 0 }` when debit
     throws "insufficient credits".
3. `npm test` → 0 failures. Commit: `feat: chat presence heartbeat API`.

### Task 3 — Stream pause/resume integration

Files: `src/app/api/chat/route.ts`, `tests/chat-presence.test.ts`

1. **Red**: test that `resumeStream` sets clock forward from injected now.
2. **Green**: in the chat route, at meter start call `pauseStream(userId)`;
   in `cleanup` after stream debit call `resumeStream(userId)` (clock jumps to
   now; stream seconds belong to the stream meter alone).
3. `npm test`, `npx tsc --noEmit`. Commit: `feat: pause open-page meter during model streams`.

### Task 4 — Client heartbeat + zero-balance redirect

Files: `src/app/chat/chat-client.tsx`

1. After initial `/api/me`, start a 10 s interval POSTing `/api/chat-presence`;
   update sidebar balance from each response.
2. On 402 (or `balanceSeconds === 0`): clear interval, `router.push("/portal")`.
3. `visibility === "hidden"` → skip heartbeat ticks (grace cap covers it).
4. `beforeunload`: `navigator.sendBeacon("/api/chat-presence", …)` to close out
   elapsed seconds immediately rather than waiting for the 30 s expiry.
5. Verify: `npx tsc --noEmit`, `npm run build`. Commit:
   `feat: page-open heartbeat billing in chat client`.

### Task 5 — Portal Chat button + final gate

Files: `src/app/portal/portal-client.tsx`

1. `<a className="btn" href="/chat">Chat</a>` → disabled + muted when
   `balance === 0` (render as a non-interactive button with title
   "No credits — buy time below").
2. **Verify Green**: `npm test` (0 failures), `npm run build`, manual
   `npm run dev`: balance ticks while `/chat` open; at 0 → redirect to
   `/portal`; Chat button disabled.
3. Commit: `feat: disable portal chat button at zero balance`.

## Validation

- `npm test`, `npx tsc --noEmit`, `npm run build` all green.
- Manual: two tabs — balance does not double-debit (shared DB clock);
  stream running — no idle double-bill; sleep 2 min — charged ≤ 60 s.

## Risks

- Workers isolate boundaries: presence expiry is DB-timestamp-driven, so only
  the in-stream pause flag is isolate-local (documented, same as inFlight).
- Client clock manipulation is irrelevant — server `Date.now()` decides.
- Heartbeat at 10 s with one guarded UPDATE per user ≈ negligible D1 load.