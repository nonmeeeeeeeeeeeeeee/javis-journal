# M9 — Download PNG (US-12) — Execution Plan

Resolved via grill session 2026-07-14, every decision checked against the seams M4–M8 already
built for this milestone (`nineSliceRects`, `FramedGrid`/`data-month-frame`, `stampBoxes`,
`stickerBoxes`, `getThumbUrls`/`getCloseupUrls`, the `fit.ts` geometry). This is the plan the
build phase executes.

> **M9 is a read-only rendering milestone — the leanest since M1's plumbing.** It draws rows that
> already exist to a canvas and hands the user a file. **No schema change, no `supabase db push`,
> no Dexie bump (stays M7/M8's v5), no `mutations.ts`/sync change, no new dependency** (manual
> canvas, never html2canvas). If the build discovers otherwise, stop and say so — it would mean a
> decision here was wrong.

## Goal
Deliver **US-12**: from the 3-dots menu, compose the **viewed** month as a PNG and let her keep or
share it. The three acceptance criteria: the current view renders to a PNG and downloads; the
applied frame, stickers and thumbnails are included; the export never blocks or freezes the editor.

> **"Viewed", not "today".** The exported month is the month she is currently looking at —
> `Calendar`'s `{year, month}` client state, which she moves with the month picker / long-press
> title — **not** the real-life current month. If she scrolls back to March 2026 and taps Download
> PNG, she gets March 2026, though real-life today is July. **`todayISO()` never enters the export
> path.** (This dovetails with decision 3: a non-current viewed month has no today disc to begin
> with, and the current viewed month has its disc stripped anyway — so the export is a pure function
> of the viewed month, identical regardless of which month happens to be "today".)

What M9 produces:

1. **A pure export layer** (`src/lib/export/`) — `plan.ts` (DOM-free draw-op plan, reusing every
   existing geometry seam so the export cannot drift from the screen), `render.ts` (the one file
   that touches a canvas), `data.ts` (the Dexie read seam that yields untainted blobs), `save.ts`
   (share/download), and the `exportMonthPng` orchestrator.
2. **The export bottom sheet** (`src/components/calendar/ExportSheet.tsx`) — a title toggle and a
   Save/Share button, opened from a now-live **Download PNG** item in `CalendarMenu`.
3. **A `/dev/export` harness** so the owner can run the Tier-2 real-device gate.

## The one decision that frames all the others

**The export is ALWAYS the full 7×6 composition of the VIEWED month — the `FramedGrid` box —
regardless of the active view.** "Viewed" means `Calendar`'s `{year, month}` state (the month she
navigated to), never `todayISO()`. US-12 says "the current view renders", but the close-up is a
*free-scroll, column-major viewport onto a wider strip*, not a self-contained rectangle; ALG-7
already sidesteps this by iterating the whole `month.grid`. So "Download PNG" does the same thing in
both views, and on whichever month she is looking at. The output
is the framed box M7/M8 normalized everything to (`7·cellW × 6·cellH`, the one rect that survives a
view switch and the rect stickers are clamped inside), plus an optional title band above it. A
scroll-cropped screenshot is a worse keepsake and a second code path; we build neither.

## Resolved decisions

1. **Always the full VIEWED month** (above). One export path; "Download PNG" is view-independent and
   keys off `Calendar`'s `{year, month}` state, never `todayISO()` — the month on screen is the
   month exported.

2. **Manual offscreen-canvas composition, never a DOM snapshot.** `border-image` does not rasterize
   in html2canvas any more than on a raw canvas — that is *why* M8 built `nineSliceRects` and
   labelled it "the seam M9's canvas export imports verbatim". A snapshot would also taint on the
   signed-URL thumbs and throw away the pure geometry the whole ADR-M5/M7/M8 arc built to kill
   preview↔export drift. M9 reuses `nineSliceRects`, `stampBoxes`, `stickerBoxes`, `monthGrid`,
   `fit` — the CSS and the canvas read one source of truth.

3. **Content set = the framed box + an optional title band; today disc excluded.** Painted:
   frame ring, weekday header row, 42 cells (paper / `line-soft` blanks + `line` hairlines), day
   numbers (ink + paper halo), stamp thumbnails, the month's stickers. **The month/year title band
   is user-optional** (it lives *outside* `FramedGrid` on screen; when included, M9 composites it
   above the framed box in Georgia so the artifact is self-labelling). **The today disc is always
   excluded** — it is a transient "where am I now" affordance, not part of her month; a shared PNG
   of July should not have one day wearing a colored disc forever. Day numbers themselves stay, and
   today's cell renders like any other numbered day.

4. **UX: 3-dots → Download PNG → bottom sheet {title toggle, Save/Share button}. No preview.** Same
   bottom-sheet language as the M7 sticker tray. The title toggle defaults **on** and is local
   sheet state (no persisted preference — not worth a profile field for a per-export choice). The
   PNG renders on tap of Save/Share, not eagerly.

5. **Save via `navigator.share` with a `File`, falling back to `<a download>`.** Branch on
   `navigator.canShare?.({ files: [file] })` (some browsers expose `share` but cannot share files),
   not on `navigator.share` alone. On her iPhone this opens the native share sheet (Save to Photos /
   Messages / AirDrop) — exactly "keep or share". Desktop takes the anchor path. **`AbortError`
   (she dismissed the sheet) is swallowed silently**; any *non-Abort* share failure falls back to
   the anchor download so she still gets the file. Filename: `javis-journal-${YYYY}-${MM}.png`.

6. **Output resolution: `EXPORT_CELL_W = 252` (7·36, so `cellH = 216` is exact).** Full grid
   1764 × 1296; with ring + mat + optional title band the PNG lands ≈ 1800 × 1400 — a ~2.4 MP
   keepsake, instant to render and share on a phone. Frame scale reuses `frameScale(gridWidth)` →
   ×4 (integer, nearest-neighbour crisp).

7. **Stamps drawn from 256px thumbs; stickers drawn from 2048px mains.** A full-cell stamp is
   ≤252px, so a 256px thumb is essentially 1:1 — "thumbnails are included" is satisfied literally
   *and* sharply, at zero of the 2048px memory cost the app avoids. A sticker can reach ~529px wide
   in this export (`MAX_SCALE = 0.3` of the grid), 2× past its thumb — exactly M7's deferred
   softness case — so stickers pull `main` (`getCloseupUrls`' blob). Stickers are few (≤50, usually
   a handful) PNGs; this is the export-time answer to M7's sharpness knob.

8. **Untainted canvas: decode from `Blob`s via `createImageBitmap`, never an `<img>` from a signed
   URL.** `getThumbUrls`/`getCloseupUrls` return a cross-origin signed Supabase URL on a remote
   miss; an `<img>` from it taints the canvas and `convertToBlob()` throws `SecurityError` — the
   export would fail silently for images not yet backfilled locally (fresh pull on a second device).
   `data.ts` reads `db.image_blobs` blobs directly; on a local miss it **`fetch()`es the signed URL
   → `.blob()`** (Supabase signed URLs are CORS-GETtable) and decodes *that*. **A total miss
   (offline AND not on device) skips that one image; the export still succeeds** — never abort the
   whole PNG for one unresolved image. The frame asset is same-origin from `public/` and never
   taints.

9. **Non-blocking without a worker.** The only expensive work is image decode, and
   `createImageBitmap(blob)` already decodes off the main thread; the `drawImage` calls are
   microsecond-scale. So "never blocks" is met by `await`-ing the decodes (in small parallel
   batches for speed), then drawing synchronously in z-order. A Web Worker would mean
   IndexedDB-in-worker or transferring dozens of blobs for a cold, occasional action — real
   complexity, no responsiveness gain. `OffscreenCanvas` (not a mounted `<canvas>`) purely for the
   no-DOM `convertToBlob`; well-supported on her iOS Safari.

10. **Fonts + colors read from the CSS tokens at export time — no duplicated values.** The fonts
    are *system* fonts (`--font-title: Georgia, serif`; `--font-body: system-ui, …`), always
    present on her iPhone, so there is no web-font loading hazard; `await document.fonts.ready` once
    as free insurance. Read `--font-title`/`--font-body` and `--color-paper`/`--color-line`/
    `--color-line-soft`/`--color-ink` off `document.documentElement` so the PNG tracks the shipped
    `pastel` theme with zero duplicated hex. The day-number **paper halo** (on screen a
    `textShadow` in paper) is reproduced by stroking the glyph in paper before filling it in ink, so
    numbers stay legible over stamps.

11. **Per-cell recipe.** Fill the whole framed box (incl. the mat) paper. Numbered cell: paper fill
    → stamp thumbs (`stampBoxes`) → day-number chip (ink + paper-stroke halo, **no** today disc).
    Blank leading/trailing cell: `line-soft` fill. Hairlines: 1px·scale `line` strokes on the
    bottom/right edges (matching `border-b border-r`), snapped to device-pixel boundaries so they
    stay crisp. Stickers last, over the grid, via `stickerBoxes` in day-grid-bbox coordinates.

12. **Module split mirrors `nine-slice.ts`: pure geometry vs raster vs data.**
    - `plan.ts` — DOM-free, pure. `(year, month, weekStart, includeTitle, dims)` + the month's
      stamp/sticker rows + aspects → a flat list of **draw ops** (frame slices, cell fills,
      hairlines, day-number positions, stamp rects, sticker rects, optional title band). Reuses
      `monthGrid`/`stampBoxes`/`stickerBoxes`/`fit` verbatim. Fully unit-testable, zero canvas.
    - `render.ts` — the imperative raster: plan + decoded `ImageBitmap`s + token values →
      `OffscreenCanvas` → `Blob`. The only file that touches a canvas.
    - `data.ts` — the export read seam (decision 8): reads the month's `entries`/`stamps`,
      `placed_stickers`, `images`+`image_blobs` (aspects + blobs, thumbs for stamps / mains for
      stickers, signed-fetch fallback) directly from Dexie. Testable under fake-indexeddb.
    - `save.ts` — `navigator.share`/anchor + filename (decision 5).
    - `exportMonthPng(year, month, weekStart, frame, includeTitle)` — orchestrator. Its `year/month`
      are `Calendar`'s **viewed** `{year, month}` state, passed straight through; the export never
      reads `todayISO()`.
    The caller passes `year/month/weekStart/frame/includeTitle` (Calendar already holds all five —
    `year`/`month` are the viewed month it is already rendering); everything else is read fresh from
    Dexie inside `data.ts`. **Not** the reactive display hooks —
    those manage object-URL handles for on-screen rendering and are the wrong tool for a one-shot
    export that needs blobs.

13. **Sheet async states.** On tap, Save/Share becomes disabled with a "Preparing…" label until the
    blob is ready, then fires share/download and the sheet closes (this is also the double-tap
    guard). Total render failure keeps the sheet open with an inline "Couldn't create the image —
    try again". An **empty month** (no stamps, no stickers) exports normally — a blank framed
    calendar with day numbers and the title is a valid keepsake.

## Ground rules for every task
- **This is NOT the Next.js you know (v16.x).** Read `node_modules/next/dist/docs/` before touching
  `src/app/**`. (M9 touches it once: the `/dev/export` harness route.)
- **Package manager is pnpm.** `pnpm lint` + `pnpm build` green at the end of **every** task;
  `pnpm test` green by the last.
- **Reuse the seams.** Geometry → `nineSliceRects`, `stampBoxes`, `stickerBoxes`, `monthGrid`,
  `fit`; frame constants → `FRAMES`/`frameScale`/`frameBoxInsets`. **Do not re-derive any of it.**
  Reads for the export go through the new `export/data.ts` (Dexie); UI reads elsewhere still go
  through `queries.ts`. Components never touch `db.*` or Supabase directly outside `data.ts`.
- **Read-only milestone.** No `mutations.ts`, no sync, no schema, no Dexie bump, no new dependency.
- **Build:** direct, single-thread, branch `m9-export` off `master`. **Not** `/parallel-plan`.
  Commit per task, conventional message, **no `Co-Authored-By` trailer**.
- **Look at the output.** A PNG is a visual object; the `/dev/export` harness renders without a
  session (like M6/M8's benches). Do not ship the export having never opened the image.

## Task DAG

```
T1 plan.ts  (pure)          T2 data.ts (Dexie)        T4 save.ts (share/dl)
      \                          /                          |
       \                        /                           |
        v                      v                            |
       T3 render.ts (raster) <-- reads token values         |
                    \                                        |
                     v                                       v
                    T5 exportMonthPng orchestrator <---------+
                                   |
                     +-------------+-------------+
                     v                           v
        T6 ExportSheet + CalendarMenu       T7 /dev/export harness
           + Calendar wiring
```

- **T1 `plan.ts` (pure geometry).** Dimensions (with/without title band, with each frame incl.
  `'none'`), frame-slice rects via `nineSliceRects`, 42 cell rects + blanks, day-number positions,
  stamp rects via `stampBoxes`, sticker rects via `stickerBoxes`. No canvas. *Tests here.*
- **T2 `data.ts` (Dexie read seam).** Month rows + aspects + blobs; thumb for stamps, main for
  stickers; signed-URL-`fetch` fallback; missing-while-offline skip. *Tests under fake-indexeddb.*
- **T3 `render.ts` (raster).** Consumes T1's plan + T2's decoded bitmaps + the token values →
  `OffscreenCanvas` → `Blob`. Token/halo/hairline reproduction (decisions 10–11). *Tests via a
  mocked 2D context.*
- **T4 `save.ts`.** `canShare` branch, `AbortError` swallow, non-Abort → download fallback,
  filename. Independent of T1–T3. *Tests here.*
- **T5 `exportMonthPng` orchestrator.** Wires data → decode (batched `createImageBitmap`) → plan →
  render → save. Depends on T1–T4.
- **T6 UI.** `ExportSheet.tsx` (title toggle default-on, Preparing… button, inline error, empty-OK),
  live **Download PNG** in `CalendarMenu`, Calendar state to open the sheet passing the **viewed**
  `year/month` (+ `weekStart/frame`) — the same state the mounted month view renders from, never
  `todayISO()`. Depends on T5.
- **T7 `/dev/export` harness.** Renders a month to an on-page `<img>` + download button, session-
  free. Depends on T5.

## Definition of done

**Tier 1 — automated (`pnpm lint`, `pnpm build`, `pnpm test` all green):**
- **`plan.ts`**: output dimensions correct with/without the title band and with each frame incl.
  `'none'`; the 42 cell rects tile the grid exactly; blank leading/trailing cells land in the right
  slots for both Mon and Sun week-starts; stamp rects equal `stampBoxes`, sticker rects equal
  `stickerBoxes`; and a guard that **today is not specially marked** (the decision-3 exclusion — the
  thing that would regress silently). Plus a guard that the plan is a pure function of the passed
  `{year, month}` — exporting a non-current (viewed ≠ today) month produces that month's grid, and
  the plan output does not vary with the real clock (`todayISO()` is never read).
- **`data.ts`** (fake-indexeddb): picks `thumb` for stamps / `main` for stickers; the signed-URL
  `fetch` fallback path (mocked); a missing-while-offline image is skipped, not fatal.
- **`render.ts`** (mocked 2D context): the draw-call sequence is frame → cells → thumbs → stickers →
  title; the **taint-safety canary** — `drawImage` is only ever called with `ImageBitmap`s, never an
  `<img>`/URL; no today-disc fill is emitted.
- **`save.ts`**: `canShare` selects share vs download correctly; `AbortError` is swallowed; a
  non-Abort share error falls back to download.
- **No regression** to the M2–M8 suites (281 tests green on master today).

**Tier 2 — owner-run (real iPhone gate, `/dev/export` + the live menu item):**
- The share sheet opens and **Save to Photos** works; the saved PNG shows the applied frame,
  stickers, and day thumbnails; **no today disc**; the title toggle visibly adds/removes the band.
- Verified with a decorated month AND an empty month; and once with the frame set to `'none'`.
- Export runs without freezing the editor mid-scroll.

The owner merges `m9-export` → `master` and runs the Tier-2 gate.
