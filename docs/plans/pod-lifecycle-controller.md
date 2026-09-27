# Pod Lifecycle Controller — Implementation Plan (Solution C)

**Status:** draft for review · **Feature:** pod start/stop control via a Cloudflare Durable Object "PodController"

## Goal

Move all Runpod pod lifecycle transitions (start / idle-stop) out of per-isolate
module state into a single-owner Durable Object with alarms, eliminating the
four review findings: prod idle-stop never firing, duplicate-start 409s,
idle-stopper racing in-flight streams, and un-honored disconnects during warmup.

## Architecture

```text
chat route ──ensureRunning()──▶ PodController DO ──▶ runpod.ts (REST v2)
   │                              │   ▲
   │ (SSE progress stays local)   │   │ activity touch / stream leases
   ▼                              ▼   │
llama-server health poll      DO storage (single source of truth)
                              - lastActivityAt
                              - stream leases (userId, expiresAt)
                              - pod status cache
```

- **PodController DO** is the *only* actor that issues `startPod`/`stopPod`.
  Serialization inside the DO removes the 409 race by design.
- **DO alarm** (not cron) owns the idle stop: after every activity touch, the DO
  arms `state.setAlarm(lastActivityAt + IDLE_TIMEOUT)`. Alarms fire even with
  zero traffic, sub-minute precision, no wrangler cron entry.
- **Stream leases:** each active chat stream registers `{userId, lease}` in DO
  storage with a TTL refreshed by the existing chat-lock heartbeat interval.
  Stale leases (crashed isolate) expire and are swept by the alarm — no leaked
  active-stream counter (fixes the counter-leak risk from the review).
- **D1 is not used for pod state.** The DO is the single owner, so its storage
  is the truth; D1 would add a second writer and reintroduce races.

## Changes

### 1. `src/lib/pod/PodController.ts` (new) — the DO

Public RPC surface (called from the chat route / any isolate):

- `ensureRunning(): Promise<"running" | "starting">` — serialized: checks cached
  status; issues `startPod()` only when transition is valid (gate on `actions`
  from v2 GET); tolerates 409 as "already transitioning"; returns quickly and
  lets the caller poll `llamaHealthy()` locally (SSE progress events unchanged).
- `touchActivity(): void` — updates `lastActivityAt`, re-arms the alarm.
- `beginStream(userId): void` / `endStream(userId): void` — lease registry.
- `alarm()` — if any live lease: re-arm and return. If `now - lastActivityAt <
  IDLE_TIMEOUT`: re-arm for the remainder. Else `stopPod()` (409 = already
  stopped = success), clear cache, log via `logger.info`.
- On DO restart (`constructor`), re-arm alarm from persisted `lastActivityAt` —
  survives isolate death and deploys.

### 2. `src/lib/pod.ts` — split into driver + local loop

- New driver interface `PodLifecycle`:
  - `do` driver (production, workerd): routes everything through
    `getCloudflareContext().env.POD_CONTROLLER`.
  - `inline` driver (current logic minus the broken `setInterval` stopper —
    keeps warmup polling + activity touch in-process) used under `next dev`,
    where DO bindings don't exist.
- Selection at module load: try `getCloudflareContext()`, fall back to inline.
  (Deletes the `typeof timer.unref` guard as part of this.)
- `ensurePodUp(onStatus)` keeps its shape — the *decision* to start now comes
  from `ensureRunning()`, and the poll loop aborts on the caller's
  `AbortSignal` (fixes finding 4).

### 3. `src/lib/runpod.ts` — hardening

- Delete dead `PodState` interface, drop `path ?? ""`.
- `getPod()` includes error body; new `isConflict(res)` helper (409).
- `startPod()`/`stopPod()` gain `actions` gating at call sites (in the DO).

### 4. `src/app/api/chat/route.ts`

- `ensurePodUp(...)` call unchanged in shape; add `signal: aborter.signal`.
- Wrap the stream loop with `beginStream(userId)` / `endStream(userId)` in
  `cleanup()` (idempotent, pairs with `cleanedUp` flag).

### 5. `src/worker.ts` (new) + `wrangler.jsonc`

Custom worker entry, per the documented OpenNext pattern
(opennext.js.org/cloudflare/howtos/custom-worker):

```ts
// src/worker.ts
import { default as handler } from "./.open-next/worker.js";
export { PodController } from "@/lib/pod/PodController";
export default { fetch: handler.fetch } satisfies ExportedHandler;
```

- `wrangler.jsonc`: `main` → `src/worker.ts`; add `durable_objects` binding
  `POD_CONTROLLER` → `PodController`; add `migrations` with
  `new_sqlite_classes` (SQLite-backed, matches OpenNext's own DOs).
- `package.json`: `build:worker`/`deploy` unchanged (wrangler reads the new
  `main`); `preview` unchanged.
- No cron trigger needed — alarms replace it.

### 6. Tests (`tests/`)

- Unit: DO state machine with fake alarms/timers (vitest) — idle stop fires,
  lease prevents stop, stale lease swept, alarm re-arm after activity, 409 on
  stop treated as success.
- Unit: driver selection + runpod.ts hardening (409 mapping, error bodies).
- Integration: existing chat route tests keep passing (inline driver).
- Manual on prod: cold start → chat streams; disconnect mid-warmup stops the
  poll; idle stop fires (watch logger webhook alerts); double-start race via
  two users.

## Rollout

1. Land DO + driver behind env flag `POD_CONTROL_MODE=inline|durable` (default
   inline) — mergeable, zero behavior change.
2. Add wrangler binding + migration, deploy, flip prod to `durable`.
3. Watch `alerts` for idle-stopper/transition errors for a day; remove the
   inline production path in a follow-up (keep for dev only).

## Risks / open questions

- **DO + OpenNext compat:** the pattern is documented upstream and OpenNext
  itself ships DO classes, but the binding is untested in this repo — step 2 is
  a canary deploy for that reason.
- **Dev/prod drift:** two drivers must stay behaviorally identical; tests cover
  the state machine, not the driver split — mitigated by keeping the inline
  driver thin.
- **DO storage persistence across deploys:** alarms and storage survive
  deploys; verify in canary that `lastActivityAt` survives.
- **Single-pod assumption baked into DO** (no pod-id in state) — fine today;
  multi-pod would need a keyed DO namespace later.

**Estimate:** ~3–4 days incl. tests and canary deploy.