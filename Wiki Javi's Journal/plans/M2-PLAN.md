# M2 — Local-first + Sync (US-11, sync half of US-13) — Execution Plan

Resolved via grill session 2026-07-07. This is the plan `/parallel-plan` executes.

## Goal
Deliver US-11 (silent optimistic autosave + cross-device sync) and the sync half of
US-13 (no long-run freeze): a Dexie local-first store mirroring the Postgres schema, plus
a debounced push (ALG-3) / delta-pull LWW-merge (ALG-4) sync engine. There is no calendar
UI yet (M4+) to generate real edits — this milestone is pure data-layer plumbing, verified
by automated tests, and wired live into the running app so it's actually exercised now
(the `profiles` row already exists post-login from M1) rather than dormant until a future
milestone remembers to turn it on.

## Ground rules for every task
- **This is NOT the Next.js you know (v16.2.10).** Before touching `src/app/layout.tsx`,
  read the relevant guide under `node_modules/next/dist/docs/`. Heed deprecation notices.
- Reuse the existing Postgres row types in `src/lib/db/types.ts` verbatim as the Dexie row
  shapes — don't redefine `Entry`/`Stamp`/`PlacedSticker`/`Profile`/`ImageRow`/
  `StickerAsset`. Add new outbox/meta/status types alongside them.
- Package manager is **pnpm** — use `pnpm add -D vitest fake-indexeddb`, never npm/yarn.
- `pnpm lint` and `pnpm build` must pass at the end of each task; `pnpm test` (new) must
  pass by the end of Task 5.
- No manual clicking required for this milestone's DoD — automated tests are the
  verification (see Definition of done).

## Definition of done
- `pnpm lint`, `pnpm build`, and `pnpm test` all pass.
- Tests demonstrate: optimistic write → debounced flush → outbox cleared; pull merges
  remote-newer rows and keeps local-dirty-newer ones; tie-break by higher id on equal
  timestamps; a `deleted_at` tombstone removes the local row; failed flush/pull backs off
  exponentially (2s→60s) and resets on success; a simulated constraint-violation row (e.g.
  tripping the stamp cap) gets quarantined in the outbox while the rest of that table's
  dirty rows still sync on the next flush.
- `SyncBoot` is mounted in `src/app/layout.tsx` and actually starts the pull loop for a
  signed-in session in the running app (not just in tests).
- No regressions to the M1 auth flow (`pnpm build` + a manual sign-in still works).

---

## Resolved design decisions
(Full rationale in the grill session; summarized here for implementers.)

1. **Verification:** `vitest` + `fake-indexeddb`, mocked Supabase client. This is the primary
   DoD evidence since there's no UI yet.
2. **Table scope:** all 7 Postgres tables get Dexie table defs now. The generic LWW engine
   (ALG-3/ALG-4) only covers the 4 `updated_at` tables: `entries`, `stamps`,
   `placed_stickers`, `profiles`. `images`/`sticker_assets` get pull-only sync (#9).
3. **Dirty tracking:** a `sync_outbox` table — `{ id, table, rowId, op, attempts,
   quarantined, lastError }` — not a `_dirty` column on entity rows.
4. **Cursors + pull cadence:** a `sync_meta` table (`{ table, cursor }`). Pull runs on module
   init, on `visibilitychange`/`focus`, and every 60s while visible.
5. **User identity:** `supabase.auth.getUser()` read fresh each flush/pull cycle, not cached.
6. **Debounce API:** `markDirty(table, rowId, op)` arms an 800ms idle timer → `flush()`.
   Exported `flushNow()` for future gesture-end hooks (M6+, ALG-9) to call directly.
7. **Backoff:** exponential 2s→60s cap, reset on success, retried forever while the outbox
   is non-empty.
8. **Offline detection:** inferred purely from failed requests (try/catch), no
   `navigator.onLine`. A `syncStatus` observable (`'idle'|'syncing'|'offline'|'error'`) is
   exposed for future UI, unconsumed for now.
9. **images/sticker_assets:** pull-only — `images` insert-if-missing by `created_at` cursor;
   `sticker_assets` full tray refetch (no cursor in its GET signature). No push/outbox for
   either; that lands with M3/M7's upload flows.
10. **ID generation:** client mints `crypto.randomUUID()` at creation time; Postgres's
    `gen_random_uuid()` default only fires when `id` is omitted, so no schema change needed.
11. **Live wiring:** `SyncBoot` client component mounted in `src/app/layout.tsx` calls
    `startSyncLoop()` for signed-in sessions.
12. **Poison-pill rows:** Postgrest batch upserts are atomic — one bad row fails the whole
    batch. On batch failure, fall back to per-row upserts, quarantine only the bad row
    (stop retrying it, keep `lastError`), let the rest of the table's dirty rows sync
    normally. Retry-forever backoff applies only to genuine network/offline failures.

---

## DAG
```
Task 1 (Dexie schema + outbox/meta) ─┐
                                     ├─► Task 2 (Push engine, ALG-3)   ─┐
                                     ├─► Task 3 (Pull engine, ALG-4)   ─┤─► Task 5 (Wiring + integration tests)
                                     └─► Task 4 (vitest + fake-indexeddb setup)
```
Task 1 is the sole leaf everything depends on. Tasks 2/3/4 are mutually independent once
Task 1 lands (push logic, pull logic, and test tooling don't share code) and should run in
parallel. Task 5 depends on both 2 and 3.

---

## Task 1 — Dexie schema + outbox/meta  *(leaf · blocks everything else)*
**Files:** `src/lib/db/index.ts`, `src/lib/db/sync-types.ts`

1. Define a Dexie database (e.g. `JournalDB extends Dexie`), schema version 1, with tables:
   `entries`, `stamps`, `placed_stickers`, `profiles`, `images`, `sticker_assets` — typed via
   the existing `Entry`/`Stamp`/`PlacedSticker`/`Profile`/`ImageRow`/`StickerAsset` types from
   `src/lib/db/types.ts` (do not redefine these shapes).
2. Add `sync_outbox` table: `{ id: string (uuid), table: string, rowId: string,
   op: 'upsert' | 'delete', attempts: number, quarantined: boolean,
   lastError: string | null, createdAt: number }`.
3. Add `sync_meta` table: `{ table: string (PK), cursor: string | null }` — one row per
   synced table (`entries`, `stamps`, `placed_stickers`, `profiles`, `images`,
   `sticker_assets`).
4. Indexes: primary key `id` on entity tables (matches Postgres uuid PK); `entry_id` index
   on `stamps` (mirrors `stamps_entry_live_idx`); `rowId`+`table` compound index on
   `sync_outbox` for outbox scans.
5. Export a singleton `db` instance and typed helpers (`db.entries`, etc.) for the other
   tasks to import.

---

## Task 2 — Push engine (ALG-3)  *(depends on Task 1 · parallel with 3, 4)*
**Files:** `src/lib/sync/outbox.ts`, `src/lib/sync/push.ts`

1. `outbox.ts`: `markDirty(table, rowId, op)` upserts an outbox row (dedupe by
   `table`+`rowId`, latest `op` wins); `clearDirty(table, rowId)`; `quarantine(table, rowId,
   error)` sets `quarantined: true` + `lastError`; `getPending(table)` returns non-quarantined
   rows.
2. `push.ts`: `flush()` groups pending outbox rows by table, batch-upserts via
   `supabase.from(table).upsert(rows)` for the 4 LWW tables. On batch failure: retry the
   same rows individually; any row whose upsert fails gets `quarantine()`'d (don't retry it
   again); rows that succeed individually get `clearDirty()`'d. On a pure network failure
   (no response / fetch throw, not a row-level rejection), leave the whole batch dirty and
   apply backoff (see Task 5's `engine.ts` for the timer/backoff state machine — `push.ts`
   itself just needs to signal success/failure per attempt).
3. `deleted_at` writes: a `delete` op sets `deleted_at` on the local row via `markDirty`, then
   pushes as a normal upsert (soft-delete, not a Postgres `DELETE`) — matches
   `stamps`/`placed_stickers` schema (`entries`/`profiles` have no `deleted_at`, so `delete`
   op is never used for them).
4. Client-generated ids: any code creating a new row (future milestones) is expected to set
   `id: crypto.randomUUID()` before calling `markDirty` — document this contract in a comment
   at the top of `outbox.ts`.

---

## Task 3 — Pull engine (ALG-4)  *(depends on Task 1 · parallel with 2, 4)*
**Files:** `src/lib/sync/pull.ts`

1. `pullLWW(table)` for the 4 LWW tables: read `sync_meta` cursor, fetch
   `supabase.from(table).select().gt('updated_at', cursor).eq('user_id', me)`, for each row:
   if no local row or remote `updated_at` > local `updated_at` → apply (delete locally if
   `deleted_at` set, else `put`); if remote `updated_at === local.updated_at` → higher `id`
   wins; if local is dirty (present in outbox) and newer → keep local, skip. Advance cursor
   to `max(seen updated_at)`.
2. `pullAppendOnly(table, cursorColumn)` for `images` (`created_at`) and full-refetch for
   `sticker_assets`: insert-if-missing only, no merge logic (these tables are never updated
   client-side).
3. `pullAll()` runs all 6 pulls (4 LWW + images + sticker_assets) for the current user.
4. Handle the "no local row + no remote `deleted_at`" case as a straight insert; never
   resurrect a row whose `deleted_at` is set even if `local` doesn't exist yet.

---

## Task 4 — Test tooling setup  *(depends on Task 1 · parallel with 2, 3)*
**Files:** `vitest.config.ts`, `package.json`, `src/lib/sync/test-utils.ts` (or similar)

1. `pnpm add -D vitest fake-indexeddb`. Add `"test": "vitest run"` to `package.json`
   scripts (keep existing scripts unchanged).
2. `vitest.config.ts`: configure the `fake-indexeddb` global so `Dexie` works under Node
   (per `fake-indexeddb`'s documented setup, typically an `import 'fake-indexeddb/auto'` in a
   setup file referenced from `test.setupFiles`).
3. Build a small mocked Supabase client test helper (in-memory table of rows, simulating
   `.from(table).select().gt(...).eq(...)`, `.upsert(rows)`, with a way to force the next
   call to throw for backoff/poison-pill tests).
4. This task has no product-code dependency on Tasks 2/3's internals — it only needs Task
   1's schema to exist so tests can import `db`.

---

## Task 5 — Engine wiring + SyncBoot + integration tests  *(depends on Task 2 + Task 3)*
**Files:** `src/lib/sync/engine.ts`, `src/lib/sync/status.ts`, `src/components/SyncBoot.tsx`,
`src/app/layout.tsx`, `src/lib/sync/*.test.ts`

1. `status.ts`: a minimal observable/store for `syncStatus: 'idle' | 'syncing' | 'offline' |
   'error'` (subscribe/get/set — no dependency needed, a tiny pub-sub is enough).
2. `engine.ts`:
   - `startSyncLoop()`: runs `pullAll()` immediately, then on `visibilitychange`/`focus` and
     every 60s while `document.visibilityState === 'visible'`; wraps calls with backoff
     (2s→60s exponential, reset on success) and updates `syncStatus`.
   - `flushNow()`: exported wrapper around `push.ts`'s `flush()`, callable by future
     gesture-end code with no gesture knowledge inside this module.
   - The 800ms debounce timer from `markDirty` (Task 2) calling into `flushNow()` — wire
     this here if not already done in `outbox.ts`.
   - `user_id` resolved via `supabase.auth.getUser()` fresh on each cycle (both push and
     pull calls), not cached.
3. `src/components/SyncBoot.tsx`: client component, `useEffect(() => startSyncLoop(), [])`,
   renders nothing (`null`).
4. Mount `<SyncBoot />` in `src/app/layout.tsx` inside `<body>`, alongside `{children}` —
   read the Next.js 16 docs for correct client-component-in-root-layout usage first (per
   the ground rules).
5. Integration tests (`src/lib/sync/engine.test.ts` or similar) exercising the full loop
   end-to-end against the Task 4 mock: write → dirty → flush → cleared; remote change → pull
   → merged; tombstone → local delete; tie-break; backoff sequence; poison-pill isolation.

---

## Manual steps (owner — not for agents)
None required for this milestone — no new Supabase schema, no new env vars, no manual
Supabase console steps. `pnpm dev` should be run once after Task 5 to confirm no runtime
error from mounting `SyncBoot` in the root layout.
