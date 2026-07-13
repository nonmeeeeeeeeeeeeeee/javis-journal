# M8 — Pokémon frame switching (US-10) — Execution Plan

Resolved via grill session 2026-07-13, with every decision checked against the **real extracted
assets rendered in a real browser** (`/dev/frames`, and the throwaway mock that preceded it).
This is the plan the build phase executes.

> **M8 is a rendering + asset milestone, not a schema one.** The data layer is *already done*:
> `profiles.selected_frame` exists in Postgres (CHECK `rse` / `hgss_15` / `hgss_18`), in
> `src/lib/db/types.ts` (`SelectedFrame`, `Profile.selected_frame`), and in the M2 sync engine's
> LWW tables — `setStartOfWeek` already writes a `selected_frame` value when it synthesizes a
> profile row. **No migration. No Dexie bump** (stays v4, so M7 is free to take v5).

## Goal
Deliver **US-10**: three pixel-faithful Pokémon text-box borders around the month view,
switchable from the 3-dots menu, persisting and syncing like any other profile setting.

What M8 produces:

1. **Three 9-slice `border-image` assets** in `public/frames/` — `rse.png`, `hgss_15.png`,
   `hgss_18.png` — extracted pixel-for-pixel from Javi's reference screenshots. **220–300 bytes
   each.**
2. **A pure geometry module** (`src/lib/frames/`) holding the measured slice insets as one
   constants object, plus the 9-slice rect math **M9's canvas export will import verbatim**.
3. **The frame ring on the calendar** — live in *both* views, costing the phone grid **zero
   cells**.
4. **The picker** — a "Frame" row in the 3-dots menu with three live mini-frame swatches;
   optimistic write through `markDirty`.

## Ground rules for every task
- **This is NOT the Next.js you know (v16.x).** Read `node_modules/next/dist/docs/` before
  touching `src/app/**`. (M8 touches it once: the `/dev/frames` harness route.)
- **Package manager is pnpm.** `pnpm lint` + `pnpm build` green at the end of **every** task;
  `pnpm test` green by the last.
- **Reuse the seams.** Reads → `src/lib/db/queries.ts` (`useProfile`); writes →
  `src/lib/db/mutations.ts` (`markDirty` only — copy `setStartOfWeek`); scheduling stays in
  `src/lib/sync/engine.ts`. Components never touch `db.*` or Supabase.
- **Styling is Tailwind v4** (CSS-first `@theme` in `globals.css`, no `tailwind.config.js`).
  All three frames must work under the shipped `pastel` theme.
- **All frame geometry lives in exactly one object** (`FRAMES` in `src/lib/frames/spec.ts`) —
  M6's `PUNCH_WINDOW` lesson. Tests assert *invariants*, not the literal numbers, so
  re-exporting an asset is a one-object edit.
- **Build:** direct, single-thread, branch `m8-frames` off `master`. **Not** `/parallel-plan`.
  Commit per task, conventional message, **no `Co-Authored-By` trailer**.
- **Merge coordination:** M7 is running in parallel and also touches `Calendar.tsx` and
  `CalendarMenu.tsx`. Keep edits to those two files **minimal and additive**; expect a small
  conflict at merge.

## Definition of done

**Tier 1 — automated (`pnpm lint`, `pnpm build`, `pnpm test` all green):**
- **Slice geometry (`spec.ts`)**: for each frame, the constants are *self-consistent and inside
  the asset* — `left + period + right === sheetW`, `top + period + bottom === sheetH`, every
  inset > 0, `ink ≤ slice` on every side, and the ring is **symmetric** (`slice.l === slice.r`,
  `ink.l === ink.r`). A mis-measured re-export fails the suite instead of shipping.
- **9-slice rects (`nine-slice.ts`)**: `nineSliceRects(spec, w, h, scale)` returns the 8 ring
  rects (no centre) whose source rects tile the sheet exactly and whose destination rects tile
  the ring exactly. This is **the seam M9 imports**; pure, DOM-free, unit-tested here so M9 can
  trust it.
- **The fit model still fits, with the frame applied.** `computeCellW` becomes frame-aware and
  is proved at **phone (390×844), tablet (768×1024) and desktop (1440×900)**, for **all 3 frames
  × both views**, to yield a 7×6 grid that fits with **no vertical scroll**
  (`6 × cellH + overhead ≤ availH`) and **no horizontal scroll** in full-month
  (`7 × cellW ≤ availW`).
- **The frame is free on a phone.** At ×2, `computeCellW` returns **the same `cellW` as with no
  frame** for all 3 frames at 390px — the ring fits inside the 24px `GUTTER` that `fit.ts`
  already reserves. This is the "never fights her" assertion and the one that would regress
  silently.
- **No regression** to the M2 / M3 / M4 / M5 / M6 suites (**166 tests green on `master`
  today**). In particular `computeCellW`'s existing cases must be **unchanged** when no frame
  inset is supplied.

**Tier 2 — owner-run browser gate (a real phone):**
- 3-dots → **Frame** row shows 3 swatches, each wearing its own real frame; the current one is
  marked.
- Tap each of the 3 → the month view **re-frames instantly**, menu still open so the change is
  visible behind it.
- Each frame **reads well on the phone** — the scallops/leaves are legible pixel art, not mud —
  and **the grid has not shrunk**.
- Both views: the frame is present in **full-month** *and* in the **close-up scroller**, where
  the columns scroll and **clip cleanly at the frame's inner edge**.
- Reload → the chosen frame **persists**. Open on a **second device** → same frame.
- Open a day → the day page covers the frame (expected; US-10 is the *month* view). Close it →
  the frame is back.

---

## Resolved design decisions

1. **Pixel-faithful palette, unrecolored.** The assets are **extracted from Javi's reference
   screenshots**, not authored from scratch and not remapped onto the pastel tokens. US-10 is
   "a hidden nod"; a nod sanded down to match the paper is just a border. The saturated GBA/DS
   palette against the cream paper is *deliberate contrast* — which is how the source material
   actually looks (a bright text box over a muted world). Confirmed in the browser: they read as
   a Pokémon text box laid on a scrapbook page, which is exactly the intent.

2. **The frame is a ring, not a text box.** `border-image-slice` **without** the `fill` keyword,
   so the interior stays `bg-page` cream and the theme survives all three frames. The games'
   white / cyan-gradient fills are dropped. (Rejected: `fill` — changing the frame would then
   change the page colour, and hgss_18's cyan→white gradient would erase the paper.)

3. **The frame rings the whole calendar block** (month title + weekday header + grid), in **both
   views** — a `border-image` on the Calendar island's **centering container** (`containerRef`),
   not a positioned overlay and not a padded wrapper.
   - *Why that element:* `ResizeObserver` already measures `containerRef.clientWidth/Height`, and
     `clientWidth` is the **padding box** — i.e. **already inside the border**. The fit model
     sees the shrunk box for free, with no new measurement plumbing.
   - *Why a real border and not an overlay:* an overlay needs z-index juggling, and it would let
     the close-up's columns scroll out past the ring and show through the frame's decorative
     **outer** scallops. A real border puts content in the padding box, where the scroller's own
     `overflow-x` clips it **exactly at the frame's inner edge**. No occlusion logic at all.
   - This works because of a *measured* property of all three sources: **the decorative edge is
     on the outside; the inner edge is essentially straight.** A ring can therefore bound
     content cleanly.
   - **`MonthCloseUp` changes `w-screen` → `w-full`** so the scroller lives inside the ring
     rather than under it. That is the only substantive edit to a month view.

4. **The ring is mirrored to be symmetric.** *(Decided from the rendered mock, not from theory.)*
   The sources are **lopsided**: the games draw a fat right end-cap. Measured ink thickness —
   `hgss_15`: left 10px vs **right 18px**; `hgss_18`: left 11px vs **right 22px**. Rendered
   faithfully around a calendar, window 18 gets a solid green slab down the right side and a thin
   sliver on the left, and it reads as a rendering bug. **The extractor mirrors the left edge onto
   the right**, giving a balanced ring in which the leaf strip reads as intentional decoration on
   both sides. `rse` is already symmetric (6/6/6/6) and is passed through untouched.
   This is the one place M8 departs from the screenshots, and it is deliberate.

5. **`border-image-outset` decouples the corner from the border thickness.** *(The other finding
   from the mock, and the reason the frame is free.)* The 9-slice **corner must be as wide as the
   wave takes to become periodic** — ~16px for `hgss_15` — even though the **edge ink is only
   10px thick**. In plain `border-image`, corner width *is* border thickness, so the ring inflates
   to **32–48px on a phone, blowing the 24px gutter and eating grid cells**. The fix:
   ```
   border-width:        ink   × scale   ← what layout pays for
   border-image-width:  slice × scale   ← how thick the image ring is drawn
   border-image-outset: (slice − ink) × scale   ← the surplus bleeds OUTWARD
   ```
   The border box pays only for the ink; the fatter corner bleeds into the margin. Every frame
   then lands at **12–22px on a phone**.

6. **The frame therefore costs the grid zero cells on a phone.** `fit.ts` already reserves
   `GUTTER = 24px` of empty breathing room per side, and that gutter is currently just empty
   space. The frame **lives in it**:
   ```
   effectiveGutter = max(0, GUTTER − frameInset)      // per axis
   ```
   so the total inset from the viewport is `max(GUTTER, frameInset)`, not `GUTTER + frameInset`.
   At ×2 the thickest ring is 22px < 24px → **`cellW` is unchanged from today**. A frame only
   starts costing cells when it is thicker than the gutter (desktop ×4, where there is room to
   spare). `FitMetrics` gains `frameW` / `frameH` (**default 0**), so every existing
   `computeCellW` test still passes unmodified.

7. **Stepped integer scale: ×2 phone (<640) / ×3 tablet (<1024) / ×4 desktop (≥1024)**, with
   `image-rendering: pixelated`. Nearest-neighbour is exact at every step — no half-pixels ever.
   (Rejected: a fluid `clamp()`/`vw` scale — it lands on fractional pixels at most widths, giving
   uneven bump widths and shimmer on resize, which is the classic way pixel art gets ruined.
   Rejected: one fixed ×3 — it puts hgss_18's ring at 33px, over the gutter, so it eats phone
   cells.) **No "no frame below a breakpoint" fallback**: at ×2 the frame is both free and
   legible, so there is no width at which dropping it is a win.

8. **`border-image-repeat: round`, not `repeat` or `stretch`.** All three borders are **periodic
   with period 8 source px on both axes** — measured, not assumed. `round` fits a **whole number
   of tiles** between the corners, rescaling the tile *along the edge only* (thickness untouched,
   corners never scaled). Because each edge tile is sampled as **the one period immediately
   adjacent to its corner**, the corner→tile junction is seamless by construction. `repeat`
   centres the tiling and would clip a partial bump against each corner; `stretch` would smear
   the wave into a gradient.

9. **Format: PNG, and the assets are tiny.** Each sheet is `(L + 8 + R) × (T + 8 + B)` source
   pixels — 24×24 to 40×22 — at **220–300 bytes**. (M6's 50 KB budget doesn't apply: that was a
   photoreal object; this is a 9-slice tile sheet, which is *why* it costs nothing.) PNG beats
   WebP at this size — WebP's container overhead exceeds the payload — and PNG's exact palette +
   alpha is what nearest-neighbour pixel art needs. **This is the argument for the tile-sheet
   approach over a pre-scaled ring bitmap**, which would have been ~100× bigger and locked to one
   scale. Budget: **≤ 1 KB per frame, ≤ 3 KB total.**

10. **Measured geometry** (the `FRAMES` constants object; every number below came from a pixel
    dump of the reference and is asserted for self-consistency in Task 1):

    | frame | source | ink palette | ink T/R/B/L | slice T/R/B/L | sheet | bytes |
    |---|---|---|---|---|---|---|
    | `rse` | `Frame_11_RSE.png` (option-screen box, 32px tall, tiles every 32 rows) | `#D090E8` `#B068B8` `#8098D8` `#B8C8E8` | 6/6/6/6 | 8/8/8/8 | 24×24 | 297 |
    | `hgss_15` | `Frame_15_HGSS.png` (cyan cloud scallop) | `#C8F8F8` `#50788C` `#A8D0D8` `#98C0C8` | 6/10/6/10 | 7/16/7/16 | 40×22 | 220 |
    | `hgss_18` | `Frame_18_HGSS.png` (blue rule + green leaf strip) | `#2878B0` `#60C050` `#F098F0` `#F8D8A0` `#A8D8F0` | 4/11/4/11 | 7/13/7/13 | 34×22 | 253 |

    Period = **8** on both axes for all three. `ink` drives `border-width`; `slice` drives
    `border-image-slice` / `-width`; their difference drives `border-image-outset` (decision 5).

11. **The picker is a row in the existing 3-dots menu**, styled exactly like the `Week starts:
    Mon / Sun` row already in `CalendarMenu.tsx`: a **"Frame"** label plus three ~44px swatches,
    each a small box **wearing its own real frame**, the selected one marked. Tapping **keeps the
    menu open** — as the week-start row already does — so she watches the calendar re-frame
    behind it. Zero new components, and a **minimal additive diff to `CalendarMenu.tsx`**, which
    matters because M7 is editing the same file. (Rejected: a bottom sheet with 3 large preview
    cards — a new component with its own dismiss/back handling, that *covers* the calendar so she
    cannot see the change land.)

12. **The write is optimistic and copies `setStartOfWeek` line for line.**
    `setSelectedFrame(frame: SelectedFrame)` in `mutations.ts`: read the local profile (synthesize
    against the signed-in user if absent), set `selected_frame` + a fresh client `updated_at`,
    `markDirty`. The M2 engine does the rest — debounced push, LWW, cross-device. `useProfile`
    gains `selectedFrame` (defaulting to `'rse'`, the column's own default). Nothing new in the
    sync layer.

13. **The frame does not show behind the day page.** `DayPage` is an opaque full-screen overlay
    and stays that way. US-10 scopes the frame to the *month view*; framing the day page too would
    collide with its ✕ / FAB and re-open geometry M6 deliberately closed.

14. **M9's debt is paid up front, in a pure module.** CSS `border-image` does not apply to canvas
    (DESIGN ALG-7 flags this), so M9's PNG export must rasterize the frame as a **manual 9-slice**.
    Rather than leave M9 to re-derive the geometry from CSS, M8 ships
    `src/lib/frames/nine-slice.ts` — `nineSliceRects(spec, w, h, scale) → { src, dst }[]` — a pure,
    DOM-free, unit-tested function that **both** the CSS path's constants **and** M9's `drawImage`
    loop consume. M9's export becomes: load `spec.src`, call `nineSliceRects`, `drawImage` 8 times.
    **The CSS and the canvas cannot drift**, because they read the same `FRAMES` object. This is
    the most valuable thing M8 leaves behind.

15. **Verification is two-tier** (as M3/M5/M6): Tier-1 vitest over the pure layer (slice
    invariants, 9-slice rect math, the fit model *with* frames, the zero-cost-on-phone assertion);
    Tier-2 an owner-run gate on a real phone for the thing no test can prove — that a 12px pixel
    scallop **reads** at arm's length. **A frame is a visual object: it gets rendered in a real
    browser during the build, not shipped unseen.** Decisions 4 and 5 both came out of doing
    exactly that, and both would have shipped as bugs otherwise.

---

## Task 0 — Extract the assets  ✅ **DONE** — commit `1af27ca`
**Files:** `scripts/extract-frames.mjs`, `public/frames/{rse,hgss_15,hgss_18}.png`

Already built and committed. The extractor had to be written and run in order to *produce* the
assets that decisions 4, 5 and 8 were validated against in a browser, so shipping it was free.

`node scripts/extract-frames.mjs` re-derives all three sheets and prints the geometry table.
Its output matches decision 10 exactly:

```
frame     ink          slice        sheet    bytes
rse       6/6/6/6      8/8/8/8      24x24    297
hgss_15   6/10/6/10    7/16/7/16    40x22    220
hgss_18   4/11/4/11    7/13/7/13    34x22    253
```

It decodes each reference (a PNG codec over `zlib` — no new deps), keys the game background +
interior fill to **alpha 0**, **mirrors the left edge onto the right** (decision 4), **solves each
slice inset by searching for the period-8 phase** (decision 8), and emits the
`(L + 8 + R) × (T + 8 + B)` sheet — corners verbatim, edge tiles = the one period adjacent to each
corner, centre cell empty. It self-checks symmetry, `slice ≥ ink`, and the 1 KB budget, and throws
on violation.

It is also the record of *how* the pixels were measured. Its header documents the **three traps**
hit while writing it — read them before changing it: the ink-depth scan must measure the
*contiguous run inward from an edge* (the game's own text is ink too, so a naive scan reports the
whole half-width as border); the mirror must go through **one** coordinate map honoured by *both*
the ink test **and** the pixel copy (mapping only the test writes a solid colour block); and the
slice inset is **not** the ink thickness — it is grown to the period-8 phase, and the surplus is
exactly what `border-image-outset` bleeds outward.

**Task 1 begins by copying the printed `ink` / `slice` numbers into `FRAMES`.**

## Task 1 — The pure frame layer  *(depends on 0 · blocks 2, 3)*
**Files:** `src/lib/frames/spec.ts`, `src/lib/frames/nine-slice.ts`, `+ .test.ts`

1. `spec.ts` — the **single `FRAMES` constants object** (decision 10) keyed by `SelectedFrame`:
   `{ src, sheetW, sheetH, ink, slice, period, label }`, plus `frameInsets(frame, scale)` (the px
   the ring costs layout — i.e. `ink × scale`, decision 5) which `fit.ts` consumes.
2. `nine-slice.ts` — `nineSliceRects(spec, w, h, scale)` (decision 14), the M9 seam.
   **No React, no Dexie, no DOM.**
3. Tests: the slice invariants, the symmetry invariant, the rect math, the tiling exactness.

## Task 2 — The fit model, frame-aware  *(depends on 1)*
**Files:** `src/lib/calendar/fit.ts`, `src/lib/calendar/fit.test.ts`

`FitMetrics` gains `frameW` / `frameH` (**default 0**); `computeCellW` swaps `GUTTER` for
`max(0, GUTTER − frameInset)` per axis (decision 6). Prove: no regression with no frame; the
**zero-cost-on-phone** assertion; the no-scroll assertion at 3 viewports × 3 frames × 2 views.

## Task 3 — Render the frame  *(depends on 1, 2)*
**Files:** `src/components/calendar/Calendar.tsx`, `MonthCloseUp.tsx`, `src/app/globals.css`

1. `border-width` / `border-image-*` / `border-image-outset` / `image-rendering: pixelated` on the
   centering container, driven by `useProfile().selectedFrame` and the breakpoint scale.
2. Feed the resulting insets into `metrics` so `computeCellW` stays honest.
3. `MonthCloseUp`: `w-screen` → `w-full` (decision 3).
4. **Keep the `Calendar.tsx` diff minimal and additive** — M7 is in the same file.

## Task 4 — The picker + the write  *(depends on 3)*
**Files:** `src/lib/db/mutations.ts`, `src/lib/db/queries.ts`,
`src/components/calendar/CalendarMenu.tsx`

`setSelectedFrame` (copy `setStartOfWeek`), `useProfile().selectedFrame`, and the **"Frame" row
with 3 live swatches** in the menu (decisions 11, 12). Additive diff — M7 is in this file too.

## Task 5 — Harness + tests + Tier-2  *(depends on 1–4)*
**Files:** `src/app/dev/frames/page.tsx`, remaining `*.test.ts`

All 3 frames × all 3 scales, side by side, around a live framed mini-calendar. **Render it in a
real browser and look at it** (decision 15). Then hand the Tier-2 gate to the owner; do not block
on it.

---

## DAG
```
Task 0 (extract assets) ─► Task 1 (spec + nine-slice, pure) ─► Task 2 (fit model) ─► Task 3 (render) ─► Task 4 (picker + write) ─► Task 5 (harness + Tier-2)
```
One thread — a straight chain. The only true leaf is Task 0, which is precisely why
`/parallel-plan` buys nothing here.

---

## Manual steps (owner — not for agents)
- **No migration to push.** `profiles.selected_frame` already exists in hosted Supabase (M1).
- **Tier-2 browser gate** (Definition of done): owner-run, on a real phone. The one claim no test
  can make is that a 12px pixel scallop reads at arm's length.
- **Merge `m8-frames` → `master`**, resolving the expected small conflict with M7 in
  `Calendar.tsx` / `CalendarMenu.tsx`.
