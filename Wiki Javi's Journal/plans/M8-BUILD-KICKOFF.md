# M8 build kickoff prompt (paste into a fresh session)

---

Build **M8 — Pokémon frame switching (US-10)** for Javi's Journal. The design is fully resolved.

**Read first, in order:**
1. `AGENTS.md` / `CLAUDE.md` (project guide — note: this is Next.js v16.x, NOT the one you know;
   read `node_modules/next/dist/docs/` before touching `src/app/**`).
2. `Wiki Javi's Journal/plans/M8-PLAN.md` — the plan you are executing. Follow it. Its Tasks 0–5,
   the DAG, the 15 "Resolved design decisions," and the two-tier Definition of done are
   authoritative.
3. Skim what you will reuse and touch: `src/lib/calendar/fit.ts` (`computeCellW` + `GUTTER` — the
   fit model you are making frame-aware), `src/components/calendar/Calendar.tsx` (the island; the
   `containerRef` you put the border on) and `MonthCloseUp.tsx` / `CalendarMenu.tsx`,
   `src/lib/db/queries.ts` (`useProfile`) + `mutations.ts` (`setStartOfWeek` — copy its shape
   exactly), `src/lib/db/types.ts` (`SelectedFrame`).

**Critical context — M8 is a rendering + asset milestone, NOT a schema one.** The data layer is
already done: `profiles.selected_frame` exists in Postgres (CHECK `rse`/`hgss_15`/`hgss_18`), in
`types.ts`, and in the M2 sync engine's LWW tables. **No migration. No Dexie bump** — Dexie stays
at v4 so M7, which is building in parallel, is free to take v5. If you think you need either,
stop and say so; you don't.

**The three decisions that are load-bearing and non-obvious** (all three came out of rendering the
real assets in a browser during the grill — they are not theory, and re-deriving them from the
screenshots alone will lead you astray):

- **The ring is mirrored to be symmetric.** The source screenshots are **lopsided** — the games
  draw a fat right end-cap (`hgss_15`: left 10px vs right 18px; `hgss_18`: left 11px vs right
  22px). Rendered faithfully, window 18 gets a solid green slab down one side and reads as a bug.
  The extractor **mirrors the left edge onto the right**. `rse` is already symmetric — pass it
  through untouched. This is the one deliberate departure from the screenshots.
- **`border-image-outset` decouples the corner from the border thickness.** The 9-slice corner
  must be as wide as the wave takes to become periodic (~16px for `hgss_15`) even though the edge
  **ink** is only 10px thick. In plain `border-image` those are the same number, which inflates
  the ring to 32–48px on a phone and **eats grid cells**. So: `border-width: ink×scale` (what
  layout pays for), `border-image-width: slice×scale`, `border-image-outset: (slice−ink)×scale`
  (the surplus bleeds *outward* into the margin).
- **The frame must cost the phone grid zero cells.** `fit.ts` already reserves a 24px `GUTTER` of
  empty space; the frame **lives inside it** — `effectiveGutter = max(0, GUTTER − frameInset)`, so
  the total viewport inset is `max(GUTTER, frameInset)`, not their sum. At ×2 the thickest ring is
  22px < 24px, so `cellW` is unchanged from today. There is a Tier-1 test for exactly this, and it
  is the assertion that would regress silently.

Also: the frame is a **ring only** (`border-image-slice` with **no `fill`** — the interior stays
`bg-page` cream; the games' white/gradient fills are dropped), it goes on the Calendar island's
**centering container** (whose `clientWidth` is already the padding box, so the fit model sees the
shrunk box for free), it shows in **both** views, and `MonthCloseUp` changes `w-screen` → `w-full`
so the scroller clips at the ring's inner edge instead of running under it.

**Setup:** branch `m8-frames` off `master`. *(It may already exist from the design session, with
a throwaway `public/frame-mocks.html` on it — delete that file in Task 0; the real harness is
`/dev/frames` in Task 5.)*

**How to build:** directly, one thread — **do NOT use `/parallel-plan`** (M8 is a straight chain,
and the codex worktree agents already failed on M2/M3). Work Task 0 → 1 → 2 → 3 → 4 → 5 in order.

**Per-task rules:**
- Package manager is **pnpm** (no npm/yarn, no `package-lock.json`).
- `pnpm lint` and `pnpm build` must pass at the end of every task; `pnpm test` by end of Task 5.
- Respect the seams: components never call `db.*` or Supabase directly — reads via `queries.ts`
  (`useProfile`), writes via `mutations.ts` (`markDirty` only — `setSelectedFrame` is a copy of
  `setStartOfWeek`). Scheduling stays in `sync/engine.ts`.
- Styling is **Tailwind v4** (CSS-first `@theme` in `src/app/globals.css`, no
  `tailwind.config.js`). All 3 frames must work under the shipped `pastel` theme.
- All frame geometry lives in the single `FRAMES` object in `src/lib/frames/spec.ts` (the M6
  `PUNCH_WINDOW` lesson). No magic numbers elsewhere; tests assert invariants, not the constants.
- **Leave M9 a clean seam:** `src/lib/frames/nine-slice.ts` exports a pure, DOM-free
  `nineSliceRects(spec, w, h, scale)` that the M9 canvas export imports verbatim (CSS
  `border-image` does not apply to canvas — DESIGN ALG-7). The CSS path and the canvas path must
  read the same `FRAMES` object so they cannot drift.
- **Merge coordination:** M7 is building in parallel and also touches `Calendar.tsx` and
  `CalendarMenu.tsx`. Keep your edits to those two files **minimal and additive**; expect a small
  conflict at merge.
- Commit per task with a conventional message (`feat:`/`chore:`/`fix:`/`docs:`). **Do NOT add a
  `Co-Authored-By` trailer** (repo convention).

**Task 0 (the extractor) has two bugs it must not reintroduce** — both were hit and fixed during
the grill:
- The ink-depth scan must measure the **contiguous run inward from each edge**, not "any ink
  anywhere" — the game's own text inside the box is ink too, and a naive scan reports the whole
  half-width as border.
- The mirror must be applied to **both** the ink test **and** the pixel copy, through one shared
  coordinate map. Mapping only the test (deciding *whether* to write with the flipped pixel, then
  copying the unflipped one) silently produces a solid block instead of a flipped leaf.

Source art: `C:\Users\olgui\Downloads\calendar frame inspo\` — `Frame_11_RSE.png`,
`Frame_15_HGSS.png`, `Frame_18_HGSS.png`. The plan's decision 10 table pins every measured number
(box crop, ink insets, slice insets, period 8, palettes, expected sheet size and byte count) —
your extractor's output should match it. Assets land in `public/frames/` at **220–300 bytes each**.

**Verification:**
- Tier-1 (you): the vitest battery in the plan's Definition of done — the slice/symmetry
  invariants over `FRAMES`, the `nineSliceRects` tiling math, the fit model producing a
  non-scrolling 7×6 grid at phone/tablet/desktop × 3 frames × 2 views **with the frame applied**,
  and the **zero-cost-on-phone** assertion. Confirm **no regression** to the M2/M3/M4/M5/M6 suites
  (166 tests green on `master` today).
- **You can and should render the frames in a real browser.** The dev server runs locally and an
  unauthenticated bench page renders without a session — that is how M6's mask geometry got fixed,
  and it is how M8's two headline decisions were found. **A frame is a visual object; do not ship
  it having never looked at it.**
- Tier-2 is **owner-run** (a real-phone gate: all 3 frames, both views, the picker changes the
  frame live behind the open menu, the grid has not shrunk, it persists across reload and matches
  on a second device). Build `/dev/frames` so the owner can run it; don't block on it yourself.

When all tasks are green, stop and report; the owner merges `m8-frames` → `master` (resolving the
small M7 conflict) and runs the Tier-2 gate. **There is no migration to push.**

---
