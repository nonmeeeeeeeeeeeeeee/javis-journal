# M6 — Day editor + punch machine (US-7, US-8) — Execution Plan

Resolved via grill session 2026-07-12. This is the plan the build phase executes.

> **Two headline reversals recorded here** (this plan is the ADR of record, as M5-PLAN was
> for the destructive cutter):
> 1. **ALG-9's long-press *menu* is dropped.** Stamp editing on the day page is **direct
>    manipulation** (long-press to select → drag / pinch / twist), not a menu of commands.
> 2. **The stamper becomes the skeuomorphic punch machine** (the mock's asset), replacing
>    M5's placeholder pastel card — and with it, M5's rotate-*mode* toggle and −/+ steppers
>    are retired in favour of two-finger gestures.
>
> Read "Resolved design decisions" before implementing.

## Goal
Deliver **US-7 (one photo = a complete entry)** and **US-8 (up to 3 stamps, arranged)** — the
first milestone that writes real `entries` / `stamps` rows, and the one that finally connects
M4's calendar to M5's cutter.

What M6 produces:

1. **The day page** — a client overlay inside the Calendar island: the tapped day, zoomed from
   its cell (FLIP), showing its stamps composed in the fixed **7:6** page box, with the
   adjacent days peeking around it.
2. **The punch machine** — the real stamper UI (`public/stamper/punch.webp`), photo framed
   *through* the machine's transparent window, ‹ › chevrons to cycle the mask, press-the-drawer
   to cut, stamp emerges from the slot.
3. **Placement (ALG-8)** — auto-place centered at max-fit; 2nd/3rd cascade smaller; the 3-cap;
   `layer_order`.
4. **Editing (the new ALG-9)** — long-press selects (blue shadow), drag to move, pinch to
   scale, twist to rotate (snap 45° on release), tap to toggle front/back, ✕ to delete with a
   "Deleted — Undo" toast.
5. **The faithful mini-composition** — the calendar day cell now renders *all* of a day's
   stamps at their real positions, via the same layout function as the day page.
6. **The schema cleanup** — the `crop_*` columns M5 left vestigial are dropped (M6 is the
   first writer of `stamps`).

## Ground rules for every task
- **This is NOT the Next.js you know (v16.x).** Read the relevant guide under
  `node_modules/next/dist/docs/` before touching `src/app/**`.
- **Package manager is pnpm.**
- **Reuse the seams; don't fork them.** Reads go through `src/lib/db/queries.ts`; writes go
  through `src/lib/db/mutations.ts`; images resolve through `src/lib/image/thumb-url.ts`
  (`getThumbUrls` / `getCloseupUrl`). Components never call `db.*` or Supabase directly.
- **Every object URL is released.** The day page's closeup handles are released on overlay
  close, exactly as `useMonthData` releases the month's thumbs (ALG-6 — the freeze fix).
- **Write once per gesture**, on gesture-*end* — never per animation frame. `markDirty` is the
  only write path; the M2 engine owns all scheduling.
- **Tunable constants live in exactly one object** (`PLACEMENT` in `src/lib/day/place.ts`).
  No magic numbers anywhere else; the tests assert invariants, not the constants, so retuning
  the feel is a one-object edit.
- `pnpm lint` and `pnpm build` must pass at the end of every task; `pnpm test` by Task 7.
- **Build:** direct, single-thread, on an `m6-day-editor` branch off `master`. **Not**
  `/parallel-plan` — M6 is one interdependent spine and the codex worktree agents already
  failed on M2/M3. Commit per task with a conventional message.

## Definition of done

**Tier 1 — automated (`pnpm lint`, `pnpm build`, `pnpm test` all green):**
- **Placement (`place.ts`)**: first stamp is centered at max-fit within the margin; 2nd/3rd are
  smaller and cascade-offset; a placed stamp's box is **always fully inside the 7:6 page**
  (including when the cascade would push it off — the clamp pulls it back); the 4th insert is
  rejected. Invariants, not literal constants.
- **Layout (`stampBoxes`)**: one pure function maps `(stamps, pageW)` → positioned boxes; the
  day page, the calendar cell, and (later) the PNG export all consume it. Scale is the stamp's
  width as a fraction of page width; height follows from the baked stamp's own aspect.
- **Hit-testing**: `topElementAt(p)` picks the highest `layer_order` whose *rotated bounding
  box* contains the point — including the case that motivated it (a tap on the transparent
  corner of a heart stamp must hit the stamp *underneath*, which `elementFromPoint` would get
  wrong).
- **Gestures**: 45° snap-on-release lands only on the 8 legal `rotation_deg` values; scale is
  clamped to `[floor, maxFit]` so a stamp can never be scaled off-page; drag is clamped inside
  the page.
- **Writes**: the first cut of a day writes the `entries` row + the `stamps` row **atomically**
  in one Dexie transaction with both `markDirty` markers; a failed bake/ingest writes
  **nothing** (no orphan entry — fail-closed). Deleting the last stamp leaves the `entries`
  row alone.
- **Delete + undo**: delete sets `deleted_at` + marks dirty immediately; undo clears it, bumps
  `updated_at`, marks dirty again, and **restores the original `layer_order`** (not to top).
- **Front/back tap toggle**: a tap brings a non-top stamp to `max+1`; a tap on the top stamp
  sends it to `min−1`.
- **Punch window calibration**: the mask window (`fitWindow`) always letterboxes fully inside
  the machine's transparent hole (`PUNCH_WINDOW`), for all 4 mask aspects.
- **Pinch isolation**: with a day open, the Calendar's pinch-to-switch handler does not fire.
- **Object-URL canary**: open/close a day 50× → the live object-URL count stays flat (mirrors
  the calendar's canary).
- **No regression** to M2's sync tests, M3's pipeline tests, M4's calendar tests, or M5's
  cutter tests.

**Tier 2 — owner-run browser gate (hard gate; a real phone where possible):**
- Tap an empty day → the OS picker opens directly → pick → the punch machine appears with the
  photo in its window → frame it with drag / pinch / twist → cycle all 4 masks with ‹ › →
  press the drawer → the stamp lands on the day page, **centered at max-fit, selected**.
- Cancel the picker, and cancel the machine: **nothing is written** (the day is still empty in
  the calendar; no phantom entry).
- Add a 2nd and a 3rd stamp: they cascade, read well, and the **+ FAB disappears at 3**.
- Long-press selects (blue shadow); drag moves; pinch scales; twist rotates and **snaps to
  45° on release**; nothing can be pushed off the page.
- **Tap toggles front/back**; the ✕ deletes; the **Undo toast restores it in place**.
- The day's pinch **never** switches the calendar view behind the overlay.
- The back gesture closes the day (not the app).
- Reopen the app: the day is exactly as she left it. A second device shows the same day.
- The calendar cell renders the day's **real composition** (all stamps, right positions).

---

## Resolved design decisions
(Full rationale in the grill session; summarized here for implementers.)

1. **The day page is a client overlay, not a route** — inside the Calendar island, with a
   `history.pushState` guard so the back gesture closes the day instead of leaving the app.
   Keeps M4's "view state is never the URL" model, keeps the calendar + its warm thumb handles
   mounted underneath, and makes the zoom transition possible at all.
2. **The day page is the 7:6 cell, zoomed** (`CELL_ASPECT` — reused, not re-invented).
   `pos_x`/`pos_y` ∈ [0,1] and `scale` (= stamp width ÷ page width) are normalized to that
   fixed box, so a day composed on the phone renders identically on desktop and M9 has a
   canonical export rect. The page is **landscape**: a portrait stamp at max-fit is
   height-bound and leaves side margins. That is correct and intended.
   *(Supersedes DESIGN's "vertical story page" wording.)*
3. **Tapping an empty day opens the OS photo picker directly** (literal US-7) — no empty day
   page is ever shown. Cancelling returns to the calendar. Tapping a day *with* stamps opens
   the day page.
4. **The `entries` row is created lazily and atomically with the first `stamps` row**, only
   after a successful cut+ingest. An abandoned pick or a failed bake writes nothing. `push.ts`
   already orders `entries` before `stamps`, so the server-side FK holds.
5. **Schema: drop `crop_offset_x` / `crop_offset_y` / `crop_scale`; keep `mask_type`.** The
   crop lives in the baked pixels (ADR-M5); three `not null` floats that mean nothing are a
   future bug. `mask_type` is kept as the only record of *which shape she cut* (free, and
   plausibly load-bearing for per-mask polish later). The M5 cutter seam widens to
   `onConfirm(imageId, maskType)`. **Dexie → v4.** Safe as a plain `alter table … drop column`:
   no `stamps` rows exist anywhere yet.
6. **Placement (ALG-8), all constants in one `PLACEMENT` object:** `MARGIN = 0.06` of the
   page's shorter side; first stamp centered at max-fit; 2nd/3rd at `0.62 × maxFit`, cascaded
   diagonally down-right by `(+0.10, +0.10)` per stamp from center, each clamped to stay inside
   the page; newest on top (`layer_order = max+1`); `MAX_STAMPS = 3`.
7. **Stamps render as DOM `<img>`s**, not a canvas: the compositor animates `transform` on the
   GPU (a smooth drag on a phone with no render loop), `layer_order` maps to `z-index`, and the
   M10 cut/place flourish is a CSS keyframe on a real node. At ≤3 images there is no perf
   argument for canvas. Canvas stays where it belongs: the bake (M5) and the export (M9).
8. **Hit-testing is our math, not `elementFromPoint`** — a baked heart/cloud stamp is a
   rectangle with transparent corners, so the DOM would let the top stamp's empty corner steal
   a tap from the stamp visibly underneath. `topElementAt` inverse-rotates the point into each
   stamp's local space and takes the highest `layer_order` whose **bounding box** contains it.
   Bounding-box, not alpha-precise — predictable, and correct for 45°-snapped rectangles.
9. **Editing = direct manipulation, gated by selection** *(this replaces DESIGN's ALG-9 menu)*:
   - **Long-press a stamp → select it**, marked by a blue shadow/glow underneath. Selection is
     the gate: an *unselected* stamp cannot be moved, so a fat thumb can never knock a
     composition askew.
   - **On the selected stamp:** one finger drags; two fingers pinch to scale and twist to
     rotate, **snapping to the nearest 45° on release** (keeping `rotation_deg` legal).
     All clamped (inside the page, ≤ max-fit).
   - **A short tap on *any* stamp toggles front/back** — no selection needed. Tap a buried
     stamp, it comes to the front; tap the top one, it goes to the back. That is the entire
     layer-order UI. A tap on a *selected* stamp does the same and keeps the selection.
   - **Delete:** while selected, a **✕ floats just off the stamp's top-right corner** (a 44px
     target, outside the stamp's bounds so it never blocks a pinch). At most one ✕ on screen.
   - **Deselect:** tap empty page space (or select another stamp, or close the day).
   - No long-press *menu*, no resize mode, no resize handles, no drag-to-trash.
   - `touch-action: none` on the page; the page does not scroll or pan.
10. **Pinch isolation (belt and braces).** The Calendar binds pinch-to-switch on `<main>`; a
    stamp pinch inside the overlay must never reach it. The overlay `stopPropagation()`s its
    touch events **and** the Calendar's handler no-ops while a day is open (a listener detail
    can be broken by a refactor; a state check cannot). Unit-tested.
11. **The + FAB is bottom-right and *hidden* (not disabled) at 3 stamps.** A greyed-out button
    invites a tap that does nothing — that is the app fighting her. The 3-cap is enforced in
    three places: the FAB's absence, a `placeStamp()` guard, and the existing Postgres
    `enforce_stamp_cap` trigger (so a two-device race cannot produce a 4th).
12. **The Stamper is presented full-screen over the day page**, never nested inside it (it has
    its own gesture surface). Cancel → back to the day, nothing written. Confirm → back to the
    day with the new stamp **placed, on top, and selected** (she just made it; it is the thing
    she is most likely to nudge, and it teaches the selection affordance with no tutorial).
13. **Delete is an optimistic soft-delete** (`deleted_at = now()` + `markDirty` immediately);
    Undo clears it with a newer `updated_at` and wins by LWW everywhere. The deferred-write
    alternative invents an undurable state that a tab-kill would silently resurrect. Toast:
    ~6s, bottom-center, non-modal, **single-level** (most recent delete only). Undo restores
    the **original `layer_order`**. The `entries` row survives an empty day (the calendar
    already filters `deleted_at`, so the day simply renders empty).
14. **The calendar cell renders the faithful mini-composition** — all of a day's live stamps at
    their real `pos`/`scale`/`rotation`, not one cover-filled thumb. The cell and the page are
    both 7:6 boxes with normalized coordinates, so this is *the same* `stampBoxes` function at
    a different pixel size — less code than maintaining the single-thumb special case forever,
    and it is the payoff of the progress view (US-3). `DayData` gains `stamps: Stamp[]` (ordered
    by `layer_order`); the batched thumb round-trip grows from ≤31 to ≤93 ids — still one call,
    still 256px thumbs, still released on month unmount.
15. **The zoom-from-the-tapped-cell transition ships in M6, as an optional layer.** FLIP: measure
    the cell's rect, animate the overlay from it to the page rect (Web Animations API, ~250ms,
    matching `Calendar.tsx`'s existing switch animation). Because the cell and page render the
    same composition, nothing cross-fades. `prefers-reduced-motion` or any failure → the day
    just opens instantly. The day page must **never wait** on the animation. It ships now
    because it is cheap *given* decision 14, it is the interaction Javi performs most, and M10
    (stability gate + cutter flourish + fireworks + ship) is where it would quietly get cut.
16. **The punch machine replaces M5's placeholder stamper.** Asset:
    `punch-model/punch-javis-journal.png` (926×1698, aspect 0.545) — its **window is a genuine
    transparent hole** (verified: alpha 0), so the photo canvas sits *behind* the art and shows
    through it. Three layers: canvas (bottom) → machine art (middle, hole) → controls (top,
    `pointer-events: none` except its own controls, so gestures reach the canvas).
    - **Ship a re-encoded WebP** at ~1000px wide, lossy, alpha preserved → `public/stamper/
      punch.webp` (the 1.5 MB PNG / 2.2 MB SVG / 1.07 MB full-res WebP are all too heavy for
      the app's hottest screen; the SVG buys nothing for a photorealistic plastic object).
    - **Fit by height** (`100svh`), centered; the leftover side gutters hold the ‹ › chevrons
      (as in the mock).
    - **`PUNCH_WINDOW = { left: 0.2462, top: 0.1425, w: 0.5032, h: 0.2650 }`** — one calibrated
      constant, normalized to the asset (hole aspect ≈ 1.04, so all 4 masks letterbox sanely:
      postage 3:4 height-bound, cloud 1.4 width-bound, heart/spiky 1:1 nearly fill). Unit-tested:
      the mask window never escapes the hole. Re-exporting the art = re-measuring one object.
17. **Framing the photo is direct manipulation too** — drag to pan, **two-finger pinch to zoom
    and twist to rotate** (continuous, *no* snap: this is the cutter, any angle is legal, and
    the bake absorbs it). This **retires M5's rotate-*mode* toggle and its −/+ steppers**, which
    existed only because there was no two-finger gesture. `minCoverScale` / `clampPan` (the
    no-blank-corner clamp) are unchanged — they constrain the *transform*, not the input device.
18. **The cut is a press on the machine.** The drawer plate (bottom, with the two screws) is the
    press surface: it depresses and darkens on `:active`, and carries a **small, legible "cut"
    label** — a photorealistic plate with no text is a discoverability gamble on the one screen
    she uses daily. The cut stamp **emerges from the slot into the drawer** (that is what the
    slot and drawer are *for*) — in M6 this is a beat before landing on the day page; the M10
    flourish (US-14) hangs off exactly this seam and must degrade gracefully. Cancel is a ✕ in
    the top corner + the system back gesture.
19. **The day page has no title.** The weekday name belongs to the *calendar* (its header /
    day borders), not the day page. The page shows the **day-number chip exactly as `DayCell`
    renders it**, scaled up — which also keeps the FLIP zoom honest (nothing pops in or out).
    *(Supersedes the mock's "Monday" header and DESIGN's day-page chrome note.)*
20. **Peeking days are decoration, and are not navigable.** No swipe-to-adjacent-day: it would
    fight the drag gesture (the #1 phone risk) and re-open the ±1-mounted memory question that
    M4 deliberately closed. They render as static dimmed slivers reusing the month's
    **already-resolved thumbs** — zero new image loads, zero extra memory. The only exits from a
    day are back / backdrop-tap → calendar.
21. **Verification is two-tier** (as M3/M5): Tier-1 vitest over the pure layer (placement,
    layout, hit-testing, snap, writes, undo, calibration, canary); Tier-2 an owner-run browser
    gate on a real phone for the gesture/feel/pixel path that no test can prove.

---

## Task 0 — Docs + schema + Dexie v4  *(do first; leaf)*
**Files:** `Wiki Javi's Journal/PLAN.md`, `DESIGN.md`, `SCHEMA.md`;
`supabase/migrations/<ts>_m6_stamps_drop_crop.sql`; `src/lib/db/index.ts`, `src/lib/db/types.ts`

1. **Migration:** `alter table stamps drop column crop_offset_x, crop_offset_y, crop_scale;`
   Keep `mask_type`. **Push it to hosted Supabase** (migrations are not auto-applied — see the
   M3 lesson).
2. **Dexie v4:** additive version bump; `Stamp` loses the three crop fields. No data migration
   (no rows exist).
3. **Docs, this plan being the ADR:**
   - **DESIGN ALG-9** — rewrite from the long-press *menu* model to the direct-manipulation
     model (decision 9). Update FLOW-4.
   - **DESIGN ALG-8** — pin the constants + the "scale = fraction of page width" definition.
   - **DESIGN** UI-screens — day page: no title, the 7:6 zoomed cell, non-navigable peeks.
   - **DESIGN** — stamper: the punch machine (decisions 16–18); note M5's rotate-mode/steppers
     are retired.
   - **PLAN** Decision Log — replace "Long-press context menu, no drag-handles" with the
     select-then-manipulate model + its rationale.
   - **SCHEMA** `stamps` — drop the crop columns; document `mask_type` as baked-in metadata.

## Task 1 — Placement + layout + hit-testing (pure)  *(leaf · blocks 3, 4, 5)*
**Files:** `src/lib/day/place.ts`, `src/lib/day/layout.ts`, `src/lib/day/hit.ts`

1. `place.ts` — the single `PLACEMENT` constants object + `placeStamp(existing, aspect) →
   {pos_x, pos_y, scale, rotation_deg, layer_order}` (ALG-8: max-fit, cascade, clamp-inside,
   3-cap rejection), `bringToFront` / `sendToBack`.
2. `layout.ts` — `stampBoxes(stamps, imageDims, pageW) → [{x,y,w,h,rot,z}]`, the one function
   shared by the day page, the calendar cell, and (later) the PNG export.
3. `hit.ts` — `topElementAt(point, boxes)` (inverse-rotate → bounding box → highest
   `layer_order`), plus the scale/rotate clamps and the 45° snap.
   **No React, no Dexie, no canvas.** Fully Tier-1 tested.

## Task 2 — Day writes (mutations)  *(leaf · blocks 4)*
**Files:** `src/lib/db/mutations.ts`, `src/lib/db/queries.ts`

1. `createStampOnDay(date, imageId, maskType)` — resolve-or-create the `entries` row and insert
   the `stamps` row **in one Dexie transaction** with both `markDirty` markers; enforce the
   3-cap; fail-closed.
2. `updateStamp(id, patch)` (transform / `layer_order`), `deleteStamp(id)` (soft),
   `restoreStamp(id, layerOrder)` — each one write, on commit, through `markDirty`.
3. `queries.ts` — `DayData.stamps: Stamp[]` (ordered by `layer_order`, live only); extend the
   batched `getThumbUrls` load to all of a month's stamp images; add `useDayStamps(date)` +
   its closeup handles (released on unmount).

## Task 3 — Calendar cell mini-composition + day-open seam  *(depends on 1, 2)*
**Files:** `src/components/calendar/DayCell.tsx`, `MonthCloseUp.tsx`, `MonthFull.tsx`,
`Calendar.tsx`

1. `DayCell` renders `stampBoxes(...)` — all live stamps at their real transforms (256px
   thumbs), keeping the day-number chip and today marker.
2. Wire the **day tap**: empty day → picker; day with stamps → open the overlay. Add the
   overlay state + `history.pushState` back guard to `Calendar.tsx`, and the
   pinch-no-op-while-open guard.

## Task 4 — The day page overlay  *(depends on 1, 2, 3)*
**Files:** `src/components/day/DayPage.tsx`, `DayStamp.tsx`, `UndoToast.tsx`,
`src/lib/day/gestures.ts`

1. The 7:6 letterboxed page + decorative peeks + day-number chip + FAB (hidden at 3).
2. `gestures.ts` — long-press select, drag, two-finger pinch/twist with 45° snap-on-release,
   tap → front/back toggle, tap-empty → deselect. Clamped via Task 1. Writes on gesture-end.
3. Selected state = blue shadow + the floating ✕; delete → soft-delete + `UndoToast`.
4. The FLIP zoom-from-cell, degrading to an instant open.

## Task 5 — The punch machine  *(depends on 1; reworks M5's Stamper)*
**Files:** `public/stamper/punch.webp`, `src/components/Stamper.tsx`,
`src/lib/stamp/gestures.ts`, `src/lib/stamp/punch.ts`

1. Re-encode the asset (~1000px wide, lossy WebP, **alpha preserved** — verify the hole).
2. `punch.ts` — the `PUNCH_WINDOW` constant + the mask-window fit inside the hole.
3. Rebuild `Stamper.tsx` as the three-layer machine: canvas behind the hole, art, controls.
   ‹ › chevrons in the gutters; the drawer as the labeled press-to-cut surface; the stamp
   emerging from the slot (the M10 flourish seam); ✕ / back to cancel.
4. `gestures.ts` — drag-pan + **two-finger pinch-zoom / twist-rotate** (continuous, no snap);
   delete the rotate-mode toggle and the −/+ steppers. `minCoverScale` / `clampPan` unchanged.
5. `onConfirm(imageId, maskType)`.

## Task 6 — Wire the flow  *(depends on 3, 4, 5)*
**Files:** `src/components/day/AddStampFlow.tsx` (or equivalent), `Calendar.tsx`

Picker → full-screen Stamper → cut → `createStampOnDay` → the day page opens (or updates) with
the stamp placed, on top, and selected. Cancel at any step writes nothing.

## Task 7 — Tests + harness + Tier-2  *(depends on 1–6)*
**Files:** `src/lib/day/*.test.ts`, `src/lib/db/*.test.ts`, `src/app/dev/day/page.tsx`

1. Tier-1 vitest across the Definition of done, incl. the **object-URL canary** (open/close a
   day 50×) and the pinch-isolation test.
2. `/dev/day` harness — seed a day with 1/2/3 stamps, exercise select/drag/pinch/twist/tap/
   delete/undo, and show the live object-URL count.
3. Run the Tier-2 owner browser gate.

---

## DAG
```
Task 0 (docs + migration + Dexie v4) ── do first
Task 1 (place/layout/hit, pure) ─┬─► Task 3 (cell composition + day-open seam) ─┐
Task 2 (day writes)  ────────────┤                                              ├─► Task 4 (day page) ─┐
                                 └─► Task 5 (punch machine) ───────────────────────────────────────────┤
                                                                                                        ├─► Task 6 (wire flow) ─► Task 7 (tests + Tier-2)
```
Tasks 1 and 2 are the true leaves; Task 5 (the machine) is the one branch that could run
alongside Tasks 3–4, but it is not worth isolating into a worktree agent — build it one thread.

---

## Manual steps (owner — not for agents)
- **Push the migration** to hosted Supabase (`supabase db push`) — it is not applied
  automatically.
- **Tier-2 browser gate** (Definition of done): owner-run, on a real phone. The M6 promise is
  "arranging a day never fights her" — that is only provable with a thumb.
