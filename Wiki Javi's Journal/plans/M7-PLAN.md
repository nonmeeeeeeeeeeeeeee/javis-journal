# M7 — Stickers + tray (US-9) — Execution Plan

Resolved via grill session 2026-07-13. This is the plan the build phase executes.

> **One headline reversal recorded here** (this plan is the ADR of record, as M5-PLAN was for
> the destructive cutter and M6-PLAN was for direct manipulation):
>
> **Stickers are MONTH-BOUNDED, not global.** A sticker placed on July 2026 appears on July
> 2026 and nowhere else. This reverses `PLAN.md`'s Decision Log ("Stickers = one global
> calendar layer — the same stickers float across every month"), US-9's acceptance criterion
> ("it lives on a global layer shown on every month"), and `SCHEMA.md`'s `placed_stickers`
> note ("shown across every month"). The **tray stays global** — she uploads a sticker once
> and can stamp it onto any month. Each month becomes its own page.
>
> Read "Resolved design decisions" before implementing.

## Goal
Deliver **US-9 (her own stickers, decorating the calendar)** — the first writer of
`sticker_assets` and `placed_stickers`, and the milestone that finally makes the calendar
*hers* rather than merely correct.

What M7 produces:

1. **The sticker layer** — a per-month decoration layer rendered inside the day-grid box of
   *both* calendar views, in grid-normalized coordinates, above the day cells.
2. **The tray** — a bottom sheet off the (currently inert) `TopBar` sticker button: 3 seeded
   personal stickers + everything she uploads. Tap to place, long-press to delete.
3. **Editing** — M6's interaction model, unchanged and *literally the same code*: long-press
   selects, drag / pinch / twist (45° snap on release), ✕ + Undo toast, one write per gesture.
4. **The shared gesture machine** — M6's `DayGestures` is extracted into a surface-parameterized
   `TransformGestures`, so the day page and the sticker layer share one state machine, one set
   of clamps-and-commit rules, and one desktop control bar.
5. **Seeding** — 3 real seeded stickers (`public/stickers/sticker_01…03.png`) ingested through
   the M3 pipeline on first boot, idempotently across devices.
6. **The sync completion** — `sticker_assets` becomes a normal LWW table (it is currently
   half-wired: pull-only, with no `updated_at`/`deleted_at` and no push path at all).

## Ground rules for every task
- **This is NOT the Next.js you know (v16.x).** Read the relevant guide under
  `node_modules/next/dist/docs/` before touching `src/app/**`.
- **Package manager is pnpm.**
- **Reuse the seams; don't fork them.** Reads go through `src/lib/db/queries.ts`; writes go
  through `src/lib/db/mutations.ts` (`markDirty` only); images resolve through
  `src/lib/image/thumb-url.ts`. Components never call `db.*` or Supabase directly.
- **Every object URL is released** (ALG-6 — the freeze fix).
- **Write once per gesture**, on gesture-*end* — never per animation frame.
- **Tunable constants live in exactly one object per module** (`STICKER` in
  `src/lib/sticker/place.ts`, mirroring `PLACEMENT`). Tests assert invariants, not constants.
- `pnpm lint` and `pnpm build` must pass at the end of every task; `pnpm test` by the last one.
- **Build:** direct, single-thread, on an `m7-stickers` branch off `master`. **Not**
  `/parallel-plan`. Commit per task with a conventional message and **no `Co-Authored-By`
  trailer** (repo convention).
- **Merge coordination:** M8 is building in parallel and also touches `Calendar.tsx` /
  `CalendarMenu.tsx`. Keep edits to those files **minimal and additive**; expect a small
  conflict at merge. M7 takes **Dexie v5**; M8 needs no Dexie bump (`profiles.selected_frame`
  already exists), so there is no renumber fight.

## Definition of done

**Tier 1 — automated (`pnpm lint`, `pnpm build`, `pnpm test` all green):**
- **Placement (`sticker/place.ts`)**: a tapped tray sticker lands at the **center of the
  currently visible portion of the grid** (mapped viewport-center → grid coords), clamped
  **fully inside the grid bbox** at every rotation; repeat placements cascade; scale is clamped
  to `[MIN_SCALE, MAX_SCALE]`; rotation snaps only to the 8 legal `rotation_deg` values; the
  51st sticker on a month is rejected. Invariants, never the literal constants.
- **The machine extraction is proven by M6's suite**: `DayGestures`' existing tests pass
  **untouched** (same class name, same public methods, same callbacks). If they don't, the
  refactor changed behavior — stop and fork a second machine instead.
- **Gesture isolation** (four cases):
  1. a two-finger pinch on a **selected** sticker does not switch the calendar view;
  2. a one-finger drag on a **selected** sticker does not scroll the close-up month;
  3. a **wheel** over a selected sticker does not scroll the close-up scroller;
  4. an **unselected** sticker does not block a tap from opening the day underneath it.
- **Object-URL canary**: flipping through 50 months with stickers placed leaves the live
  object-URL count **flat**, and equal to the number of **distinct tray assets used in the
  mounted month** — not the number of placed stickers (the dedupe assertion).
- **Writes**: place / update / delete / restore each write **once**, through `markDirty`;
  delete is an optimistic soft-delete; Undo restores the original `layer_order`.
- **Seeded protection**: a seeded tray asset cannot be tombstoned (client guard **and** the
  Postgres trigger).
- **Seed idempotency**: running the seeder twice (simulating two devices) produces the **same
  ids** and no duplicate tray entries.
- **Sync**: `sticker_assets` round-trips through the LWW push/pull path and the bespoke
  `pullStickerAssets` special case is **gone**.
- **Month-bounding**: a sticker placed on month M is absent from month M±1.
- **No regression** to M2's sync, M3's pipeline, M4's calendar, M5's cutter, or M6's day-editor
  suites (166 tests green on master today).

**Tier 2 — owner-run browser gate (hard gate; a real phone where possible):**
- Tap the sticker button → the tray opens with the **3 seeded stickers** already there.
- Tap one → it lands on the visible part of the month, **selected**; the sheet closes.
- Upload a new sticker → it appears in the tray, transparency intact, and places.
- Long-press a placed sticker → blue glow; drag / pinch / twist it; it **snaps to 45°**; it
  **never** switches the calendar view and **never** scrolls the month underneath.
- Tap an **unselected** sticker sitting over a day → **the day opens** (the sticker does not
  steal the tap).
- ✕ deletes with an Undo toast; Undo puts it back in place.
- Long-press a **seeded** tray sticker → nothing happens. Long-press an **uploaded** one →
  it deletes with Undo, and its already-placed instances **survive**.
- Switch close-up ↔ full-month: the sticker is in the **same place relative to the grid**.
- Change month: **the sticker is not there** (the month-bounded reversal).
- Reopen the app: the decorated month is exactly as she left it. A second device shows it too.
- Desktop: everything above is reachable with a mouse (bar + wheel + keyboard).
- **Sharpness check (the one open knob):** if 256px thumbs look mushy at `MAX_SCALE` on a real
  phone, the fix is a **one-line** switch to `getCloseupUrls` in the sticker layer's hook.

---

## Resolved design decisions
(Full rationale in the grill session; summarized here for implementers.)

1. **Sticker coordinates are normalized to the day-grid bounding box** — the `7·cellW × 6·cellH`
   rect that **already exists identically in both views** (`MonthFull.tsx:26` and
   `MonthCloseUp.tsx:61` both wrap the grid in `width: cellW * 7` with 6 rows). It is the only
   rect that survives a view switch, and it is the rect M9's PNG export renders anyway.
   - `pos_x`/`pos_y` ∈ [0,1] = the sticker's **center**, as fractions of grid width / height —
     the same center-based semantics as `Stamp`.
   - `scale` = the sticker's **width ÷ grid width** — the same convention as `stamps.scale`.
   - The grid's aspect falls out of the cell's: `(7·cellW) / (6·cellH)` = **49/36** =
     `CELL_ASPECT²`. Derive it; never hardcode it.
   - **Consequence, accepted:** a sticker at `pos_x = 0.9` is off-screen *at rest* in close-up
     (only ~2.5 of 7 columns are visible). It is not lost — it scrolls into view, and it is in
     the same place relative to the calendar in both views. Rejected: viewport coordinates
     (break on resize and slide over the calendar on scroll) and a separate close-up mapping
     (two coordinate systems, two sets of clamps, and M9 would have to pick one).
   - **Consequence, accepted:** stickers scale *with the cells* — they are stuck to the
     calendar, not to the glass.
2. **Stickers are MONTH-BOUNDED (the reversal).** `placed_stickers` gains
   `year_month text not null` (`'2026-07'`). The **tray is still global**. Coordinates get
   *simpler*, not harder — a sticker no longer has to look right on twelve months' worth of
   grids with different trailing-blank-cell counts — and memory rejoins the existing pattern
   (the layer loads and releases per month, exactly like `useMonthData`). **Cost:** she
   decorates each month separately; December does not inherit July's stickers.
3. **Stickers are manipulable in BOTH views, and selection is what makes that safe.** The
   close-up scroller owns one-finger pan (`MonthCloseUp.tsx:59`, `touch-action: pan-x`) and the
   Calendar owns two-finger pinch-to-switch (`Calendar.tsx:144-181`) — both gestures a sticker
   wants. M6's long-press-to-select gate already solves this:
   - **Unselected** → the layer is `pointer-events: none`. One finger still scrolls, two
     fingers still switch views, a tap still opens the day *underneath the sticker*. The
     calendar behaves exactly as it does today.
   - **Selected** → the layer takes pointer events, the scroller gets `touch-action: none`, and
     the pinch-to-switch handler no-ops off a `stickerSelectedRef` that mirrors the existing
     `dayOpenRef` (`Calendar.tsx:75`, `:184`) — the same belt-and-braces pattern as M6
     decision 10, extended by one boolean, not a new mechanism.
   - **Cost, accepted:** a long-press on a sticker overlapping a day no longer opens that day —
     it selects the sticker. A short **tap** still opens the day.
4. **One gesture machine, extracted — not two.** `DayGestures` is ~95% generic; the only
   day-specific parts are `PAGE_ASPECT` and the clamps it imports from `place.ts`. Lift the
   state machine into **`src/lib/gestures/machine.ts`** as a `TransformGestures` class
   parameterized by a small `Surface` (`{ aspect, clampScale, clampCenter, snapRotation,
   topAt }`). `DayGestures` becomes a thin constructor injecting the day surface — **same class
   name, same public methods, same callbacks**, so M6's 158 tests pass untouched (that *is* the
   acceptance test for the refactor). `StickerGestures` injects the sticker surface. The clamps
   stay in their own modules, because they are the part that legitimately differs.
   **This keeps one-write-per-gesture, the 8px slop, the long-press timer, the wheel-debounce
   commit, and the desktop accelerators in exactly one place.** If the extraction turns out to
   need any *behavioral* change to `DayGestures`, that is the signal to stop and fork instead.
5. **A sticker is clamped fully inside the grid bbox** — the same invariant as a stamp inside
   its page (`place.ts:137`, `isInsidePage`), reused against the 49/36 box. Overhanging the grid
   edge was rejected: M9's export rasterizes the grid rect, so an overhanging sticker would be
   **clipped in the export but not on screen** — the preview≠export drift ADR-M5 exists to kill.
6. **What bounds the layer:** not memory — object URLs are deduped per `image_id`
   (`queries.ts:98`), and placed stickers all draw from a small tray, so *40 placed stickers of
   5 assets hold 5 object URLs*. The bound is a **sanity cap of 50 placed stickers per month**
   in the `STICKER` constants object, enforced in `mutations.ts`. No Postgres trigger (unlike
   `enforce_stamp_cap`, this is not a correctness constraint a two-device race could violate).
7. **`sticker_assets` becomes a normal LWW table.** It is half-wired today: `pull.ts:255` has a
   bespoke insert-only `pullStickerAssets()`, and `push.ts:18` does not list it at all — a tray
   asset created on her phone would **never reach the server**. Add `updated_at` + `deleted_at`,
   add it to `LWW_TABLES` and to pull's `LWWTable` union, and **delete the bespoke special
   case** (the sync engine shrinks). Tray deletion is a soft delete, so it propagates by LWW and
   gets the same Undo toast. The insert-only + hard-delete alternative needs a bespoke `delete`
   push path *and* would let a deleted tray sticker **resurrect on the next pull** — the exact
   bug ALG-4's tombstones prevent.
8. **Seeded stickers are undeletable in the DATABASE, not just the UI** — a `before update`
   trigger rejects a tombstone on an `is_seeded` row. Same posture as `enforce_stamp_cap`: the
   UI hides the affordance, the DB makes it impossible.
9. **Deleting a tray asset never removes its placed instances.** `placed_stickers.image_id`
   renders independently of the tray (`SCHEMA.md:253`); `sticker_asset_id` is nullable
   provenance. (The soft delete does not even fire the `ON DELETE SET NULL`, so provenance
   survives too.)
10. **Seeding runs client-side on first boot, through the existing M3 pipeline.** A manifest in
    `src/lib/sticker/seeds.ts` (3 entries → `public/stickers/sticker_01…03.png`, verified 512×512
    RGBA with genuinely transparent corners) → `fetch()` → `File` → **`ingestImage(file,
    'sticker')`** (`ingest.ts:19` already takes `kind: 'sticker'` and already keeps PNG alpha) →
    a `sticker_assets` row with `is_seeded: true`. A seeded sticker is *just an uploaded sticker
    she didn't have to upload*. **Idempotency across devices is the whole trick:** the ids are
    **deterministic** — `id = uuid(SHA-256(user_id + ':' + slug))` for both the `images` row and
    the `sticker_assets` row — so a second device's seed writes the *same primary keys* (an
    upsert, not a duplicate). Per-user hash, so ids never collide between her account and the
    owner-override account. (A `stickers_seeded` flag on `profiles` was rejected: a new column
    that still races on a fresh second device.) Seeding **never blocks the calendar**: offline
    or a missing file → it no-ops and retries on the next mount.
11. **The tray is a bottom sheet** over the calendar (not a route, not a full screen) — she needs
    to see the month she is decorating while she picks. Same overlay posture as `MonthPicker` /
    `CalendarMenu`. Contents: a scrollable grid of tray thumbs + a leading **`＋` upload tile**.
    The (already-present, already-inert) `TopBar.tsx:9` sticker button opens it.
12. **Tap-to-place, not drag-from-tray.** Tap a tray sticker → it is placed on the current month,
    the sheet closes, and the new sticker is **selected** — the same beat as a freshly cut stamp
    (M6 decision 12): she just placed it, it is the thing she is most likely to nudge, and it
    teaches the selection model with no tutorial. A drag-from-tray gesture would have to cross a
    closing sheet and fight the close-up scroller, and buys nothing over tap-then-drag.
13. **A new sticker lands at the center of the VISIBLE part of the grid**, not the center of the
    grid. In close-up the grid is a wide scroller; dropping a sticker at grid-center while she is
    scrolled to the 25th would place it off-screen and read as "the tap did nothing". Map
    viewport-center → grid coords, clamp inside. In full-month the two coincide, so it costs
    nothing there. Repeat taps **cascade** diagonally so stamping the same sticker three times
    does not stack it into one invisible pile. Default size ≈ **one day cell**
    (`scale ≈ 0.14` = 1 of 7 columns).
14. **Front/back is available only on a SELECTED sticker** — the one forced divergence from M6.
    On the day page a short tap on *any* stamp toggles front/back; here, an unselected sticker is
    `pointer-events: none` so that a tap still opens the day underneath it (decision 3), so the
    tap is not the sticker's to take. Long-press to select, *then* tap to toggle. Expected to be
    nearly unused — **newest-on-top** (`layer_order = max+1`) is right almost always — but kept,
    because "I can't get that sticker out from under the other one" is a fight she should not have.
15. **The sticker layer renders from 256px THUMBS**, like everything else in the month grid.
    AGENTS.md's guardrail is literal ("never load full-res images in the month/day grid —
    thumbnails only"), the sticker layer *is* the month grid, and a user-uploaded sticker could
    legitimately be a 2048px alpha PNG — twenty of those held live is exactly the freeze.
    **Cost, bounded not hoped:** a sticker can be bigger than a stamp-in-a-cell, so 256px will be
    softer. `MAX_SCALE = 0.30` of grid width (~2 day cells) bounds the softness. **Escape hatch,
    written down on purpose:** if the Tier-2 phone gate says they look mushy, the fix is a
    one-line switch to `getCloseupUrls` — `useImageUrls` (`queries.ts:175`) already takes the
    resolver as a parameter. A knob, not a redesign.
16. **Desktop parity, by extraction.** Lift M6's `BarButton` + the `− + ⟲ ⟳` cluster
    (`DayPage.tsx:336-348`) into a shared **`src/components/ui/TransformBar.tsx`**; `DayPage` and
    the sticker layer both render it (behavior unchanged — M6's suite is the proof). Wheel scales
    the selected sticker **with `preventDefault()`** — an un-prevented wheel over the close-up
    scroller would scroll the month instead of scaling (an isolation case that only exists for
    stickers). Keyboard, bound only while a sticker is selected: `←`/`→` rotate 45°, `+`/`−`
    scale, and two M6 did not need — **`Escape` deselects**, **`Delete`/`Backspace` deletes**
    (with the same Undo toast). Whatever a thumb can do to a sticker, a mouse can do.
17. **Z-order:** the sticker layer sits **above** the day cells (it is decoration *on* the
    calendar) and **below** the day-page overlay, the tray sheet, and the menus. While a day page
    is open the sticker layer is inert (`dayOpenRef` already gates that).
18. **Verification is two-tier** (as M3/M5/M6): Tier-1 vitest over the pure layer, the writes, the
    isolation rules and the canary; Tier-2 an owner-run gate on a real phone for the
    gesture/feel/pixel path no test can prove.

---

## Task 0 — Docs + migration + Dexie v5  *(do first; leaf)*
**Files:** `Wiki Javi's Journal/PLAN.md`, `DESIGN.md`, `SCHEMA.md`;
`supabase/migrations/<ts>_m7_stickers.sql`; `src/lib/db/index.ts`, `src/lib/db/types.ts`

1. **Migration** (all safe as plain `alter table` — M7 is the first writer, **no rows exist**;
   RLS is already enabled on both tables, `init_schema.sql:116-134`):
   - `placed_stickers` + `year_month text not null` with
     `check (year_month ~ '^\d{4}-\d{2}$')`. `NOT NULL` with no default is legal precisely
     because the table is empty.
   - `create index placed_stickers_month_idx on placed_stickers(user_id, year_month) where deleted_at is null;`
   - `sticker_assets` + `updated_at timestamptz not null default now()` + `deleted_at timestamptz`
     + `sticker_assets_sync_idx (user_id, updated_at)`.
   - A `before update` trigger rejecting a tombstone on an `is_seeded` row (decision 8).
   - **Owner step:** `supabase db push`. Migrations are **not** auto-applied to hosted Supabase.
2. **Dexie → v5:** `this.version(5).stores({ placed_stickers: "id, year_month" });` — additive
   index only, no data migration. Types: `PlacedSticker` gains `year_month`; `StickerAsset` gains
   `updated_at` + `deleted_at`.
3. **Docs — this plan is the ADR:**
   - **PLAN** Decision Log — replace "Stickers = one global calendar layer" with the
     month-bounded model + its rationale. Update **US-9**'s acceptance criteria (the "global
     layer shown on every month" wording, and the stale "long-press menu" wording).
   - **SCHEMA** `placed_stickers` — `year_month`, and the coordinate note (grid bbox, decision 1).
     `sticker_assets` — `updated_at` / `deleted_at`, and the seeded-delete trigger.
   - **DESIGN** — the sticker rows of the API surface; the ALG-6 note that the sticker layer is
     per-month and thumb-only; the sticker-picker screen as a bottom sheet.

## Task 1 — Extract the gesture machine + the desktop bar  *(leaf · blocks 5)*
**Files:** `src/lib/gestures/machine.ts` (new), `src/lib/day/gestures.ts`,
`src/components/ui/TransformBar.tsx` (new), `src/components/day/DayPage.tsx`

1. `TransformGestures` + the `Surface` interface (decision 4). Mechanical move: no behavior change.
2. `DayGestures` becomes a thin constructor injecting the day surface — **same public API**.
3. Lift `BarButton` + the `− + ⟲ ⟳` cluster into `TransformBar`; `DayPage` renders it.
4. **Acceptance: M6's 158 tests pass untouched.** If they don't, stop — fork instead.

## Task 2 — The sticker pure layer  *(leaf · blocks 3, 5)*
**Files:** `src/lib/sticker/place.ts`, `src/lib/sticker/layout.ts`, `src/lib/day/hit.ts`

1. `place.ts` — the single `STICKER` constants object (`DEFAULT_SCALE`, `MIN_SCALE`,
   `MAX_SCALE = 0.30`, `CASCADE`, `MAX_PER_MONTH = 50`, `SNAP_DEG`), the grid box (aspect derived
   as `CELL_ASPECT²`), `clampCenter` / `clampScale` / `isInsideGrid` against it, `placeSticker`
   (viewport-center → grid coords, cascade, clamp, cap), `toggleFrontBack`.
2. `layout.ts` — `stickerBoxes(stickers, aspects, gridW)`, the one composition function the layer,
   the harness and (later) the M9 export share.
3. Generalize `hit.ts`'s `topElementAt` over a `Box` shape so both surfaces use it.
   **No React, no Dexie, no DOM.** Fully Tier-1 tested.

## Task 3 — DB seams: types, reads, writes, sync  *(depends on 0 · blocks 4, 5)*
**Files:** `src/lib/db/queries.ts`, `src/lib/db/mutations.ts`, `src/lib/sync/push.ts`,
`src/lib/sync/pull.ts`

1. `queries.ts` — `useMonthStickers(year, month)` (live stickers for the month + their **thumb**
   handles, released on month unmount — decisions 2, 15) and `useTray()` (live tray assets + their
   thumbs). Reuse `useImageUrls`; do not fork it.
2. `mutations.ts` — `placeSticker`, `updatePlacedSticker`, `deletePlacedSticker` /
   `restorePlacedSticker` (soft-delete + original `layer_order`), `addTrayAsset`,
   `deleteTrayAsset` / `restoreTrayAsset` (guarding `is_seeded`). Each one write, on commit,
   through `markDirty`.
3. `sync` — add `sticker_assets` to `LWW_TABLES` (push) and to the `LWWTable` union (pull);
   **delete `pullStickerAssets`** (decision 7).

## Task 4 — Seeding  *(depends on 3)*
**Files:** `src/lib/sticker/seeds.ts`, `src/lib/sticker/seed.ts`

The manifest + `seedStickers(userId)`: deterministic ids, `ingestImage(file, 'sticker')`,
idempotent across devices, never blocking, silently retryable (decision 10). Called from the
Calendar island's mount, after the first pull settles.

## Task 5 — The layer, the tray, and the wiring  *(depends on 1, 2, 3)*
**Files:** `src/components/sticker/StickerLayer.tsx`, `StickerTray.tsx`,
`src/components/calendar/{Calendar,MonthFull,MonthCloseUp,TopBar}.tsx`

1. `StickerLayer` — absolutely positioned inside the **grid box** of both views (so it scrolls
   with the close-up grid for free), `pointer-events: none` until a sticker is selected
   (decision 3). Selection glow + the floating ✕ + `UndoToast` (reused). `TransformBar` +
   wheel + keyboard on a fine pointer (decision 16).
2. `StickerTray` — the bottom sheet: thumbs + `＋` upload tile; tap-to-place; long-press to
   delete a non-seeded asset; the empty state (decisions 11, 12).
3. `Calendar.tsx` — **minimal, additive** (M8 conflict): the `stickerSelectedRef` pinch/scroll
   guard, the tray-open state, and the `TopBar` button wiring.

## Task 6 — Tests + harness + Tier-2  *(depends on 1–5)*
**Files:** `src/lib/sticker/*.test.ts`, `src/lib/db/*.test.ts`, `src/app/dev/stickers/page.tsx`

1. The Tier-1 battery from the Definition of done, incl. the **object-URL canary** (50 months →
   flat, and equal to *distinct assets in the month*) and the **four gesture-isolation cases**.
2. `/dev/stickers` — seed a month with stickers, exercise place/select/drag/pinch/twist/
   front-back/delete/undo and the tray, and show the live object-URL count.
3. Hand the Tier-2 owner gate over. **Do not block on it.**

---

## DAG
```
Task 0 (docs + migration + Dexie v5) ── do first
Task 1 (extract gesture machine + bar) ─┐
Task 2 (sticker pure layer) ────────────┼─► Task 5 (layer + tray + wiring) ─► Task 6 (tests + harness + Tier-2)
Task 3 (db seams + sync) ─┬─────────────┘
                          └─► Task 4 (seeding) ──────────────────────────────┘
```
Tasks 1, 2 and 3 are the true leaves (1 and 2 are pure; 3 depends only on Task 0's types).
Build them one thread — **not** `/parallel-plan`.

---

## Manual steps (owner — not for agents)
- **Push the migration** to hosted Supabase (`supabase db push`) — it is not applied
  automatically. (The M3 lesson: an un-pushed migration surfaces as a 400 that looks like an
  auth bug.)
- **Tier-2 browser gate** (Definition of done): owner-run, on a real phone — including the
  sticker **sharpness** call (decision 15), which is the one deliberately-open knob.
- **Merge** `m7-stickers` → `master` alongside M8, resolving the small `Calendar.tsx` /
  `CalendarMenu.tsx` conflict.
