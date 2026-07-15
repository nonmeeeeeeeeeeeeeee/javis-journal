# M9 build kickoff prompt — Download PNG (US-12)

*(Design is already done. Paste everything below the line into a fresh session to execute the
build. The resolved decisions live in `Wiki Javi's Journal/plans/M9-PLAN.md` — read it first; it is
the contract.)*

---

Build **M9 — Download PNG (US-12)** for Javi's Journal, from the resolved plan through to a merged
branch. The design phase is complete: **`Wiki Javi's Journal/plans/M9-PLAN.md`** holds the 13
resolved decisions, the task DAG (T1–T7), and a two-tier Definition of done. **That plan is the
contract — read it fully before writing a line.** Do not re-litigate its decisions; if the build
surfaces a genuine contradiction, stop and flag it rather than quietly diverging.

## The shape of the milestone (so nothing surprises you)

M9 is the **leanest milestone since M1's plumbing: read-only.** It draws rows that already exist to
an `OffscreenCanvas` and hands the user a PNG. **No schema change, no `supabase db push`, no Dexie
bump (stays M7/M8's v5), no `mutations.ts`/sync change, no new dependency.** If you find yourself
reaching for any of those, a plan decision was wrong — stop and say so.

The spine: **the export is ALWAYS the full 7×6 composition of the VIEWED month** (the `FramedGrid`
box) — `Calendar`'s `{year, month}` state, the month on screen, **never `todayISO()`** and never a
scroll-crop of the close-up. Scroll back to March and tap Download → you get March, though today is
July. It is a **manual canvas composition**, never a DOM snapshot — because `border-image`
does not rasterize on a canvas, which is exactly why M8 left `nineSliceRects` as "the seam M9
imports verbatim". Reuse every geometry seam; the CSS and the canvas must read one source of truth.

## Read before building
1. **`Wiki Javi's Journal/plans/M9-PLAN.md`** — the resolved plan. Then `M8-PLAN.md` to see the bar.
2. `AGENTS.md` / `CLAUDE.md` — the project guide. **This is Next.js v16.x, not the one you know**:
   read `node_modules/next/dist/docs/` before touching `src/app/**` (M9 touches it once, for
   `/dev/export`).
3. `Wiki Javi's Journal/DESIGN.md` — **ALG-7** (PNG export composition) and **ALG-6** (object-URL
   discipline); `PLAN.md` US-12 (the three acceptance criteria) and the milestone DAG.
4. **The seams you will reuse — do not re-derive any of them:**
   - `src/lib/frames/nine-slice.ts` (`nineSliceRects`) + `spec.ts` (`FRAMES`, `frameScale`,
     `frameBoxInsets`, `FRAME_MAT`, `SelectedFrame`/`'none'`).
   - `src/lib/day/layout.ts` (`stampBoxes`), `src/lib/sticker/layout.ts` (`stickerBoxes`),
     `src/lib/sticker/place.ts` (`GRID_ASPECT`, clamps).
   - `src/lib/calendar/month-grid.ts` (`monthGrid`, week-start) + `fit.ts` (`CELL_ASPECT_RATIO`,
     `computeCellW` — for the geometry vocabulary; the export picks its own `EXPORT_CELL_W`).
   - `src/lib/image/thumb-url.ts` (`getThumbUrls`/`getCloseupUrls` — study the signed-URL fallback;
     the export must NOT draw from those URLs, it decodes from the underlying blobs).
   - `src/components/calendar/DayCell.tsx` (the exact on-screen cell recipe to reproduce),
     `FramedGrid.tsx` (`data-month-frame`, the export target), `CalendarMenu.tsx` (where the live
     **Download PNG** item lands — it is stubbed out today), `Calendar.tsx` (holds
     `year/month/view/weekStart/frame` — the five inputs the sheet needs; `year/month` is the
     **viewed** month state, and `todayDate = isCurrentMonth(...) ? todayISO() : null` is a
     *separate* value the export must ignore).
   - `src/app/globals.css` (`--font-title`/`--font-body`, `--color-paper`/`-line`/`-line-soft`/
     `-ink` — read these at export time, do not duplicate).
5. `src/components/sticker/StickerTray.tsx` — the bottom-sheet language `ExportSheet` should echo.

## Build order (the DAG in M9-PLAN.md)

Branch **`m9-export`** off `master`. Build **directly, one thread — do NOT use `/parallel-plan`**
(the codex worktree agents lost git state on M2/M3; M4–M8 were built directly and it went fine).

- **T1 `src/lib/export/plan.ts`** (pure, DOM-free) → draw-op plan + dimensions. *Tests.*
- **T2 `src/lib/export/data.ts`** (Dexie read seam — untainted blobs, thumb/main split, signed
  fetch fallback, missing-offline skip). *Tests under fake-indexeddb.*
- **T3 `src/lib/export/render.ts`** (the only canvas file — plan + bitmaps + token values → Blob).
  *Tests via a mocked 2D context, incl. the taint-safety canary.*
- **T4 `src/lib/export/save.ts`** (`canShare`→share / else download, `AbortError` swallow,
  filename). *Tests.*
- **T5 `src/lib/export/exportMonthPng.ts`** — orchestrator (data → batched `createImageBitmap` →
  plan → render → save).
- **T6** `src/components/calendar/ExportSheet.tsx` + live **Download PNG** in `CalendarMenu.tsx` +
  Calendar state to open the sheet.
- **T7** `/dev/export` harness (session-free, renders a month to an `<img>` + download button).

Commit per task with a conventional message (`feat:`/`chore:`/`test:`), **no `Co-Authored-By`
trailer** (repo convention). `pnpm lint` + `pnpm build` green at the end of **every** task;
`pnpm test` green by the last. Styling is Tailwind v4 (CSS-first `@theme` in `globals.css`, no
`tailwind.config.js`); the sheet must work under the shipped `pastel` theme.

## The decisions most likely to bite if you skim (from the plan)

- **Untainted canvas (decision 8).** Never draw an `<img>` from a signed URL — decode from `Blob`s
  via `createImageBitmap`. A remote-miss thumb is a *cross-origin* signed URL; an `<img>` from it
  taints the canvas and `convertToBlob()` throws `SecurityError`. `fetch()` the signed URL → blob
  (CORS-GETtable) and decode that. Offline + not-on-device → skip that one image, export still
  succeeds.
- **Resolution (decisions 6–7).** `EXPORT_CELL_W = 252` (→ `cellH = 216`, grid 1764×1296, ~1800×1400
  output). Frame scale = `frameScale(gridWidth)` → ×4. **Stamps from 256 thumbs** (≈1:1, sharp),
  **stickers from 2048 mains** (they scale to ~2 cells; thumbs would be soft).
- **Today disc excluded (decision 3).** Day numbers stay; today's cell renders like any other. The
  title band is user-optional (toggle default on), composited above the framed box in Georgia.
- **No worker (decision 9).** `createImageBitmap` already decodes off-thread; `await` batched
  decodes, draw synchronously. `OffscreenCanvas` for the no-DOM `convertToBlob`.

## Verification (two-tier, as M3/M5/M6/M8)

- **Tier 1 (yours):** the vitest suite in the plan's DoD — `plan.ts` geometry incl. the
  *today-not-marked* guard, `data.ts` thumb/main + fallback + skip under fake-indexeddb, `render.ts`
  draw-sequence + **taint-safety canary** (only `ImageBitmap`s reach `drawImage`), `save.ts` branch
  logic. **No regression** to the M2–M8 suites (281 green on master today). Open the actual PNG in
  the `/dev/export` harness — do not ship it unseen.
- **Tier 2 (owner-run):** the real-iPhone gate — share sheet → Save to Photos; the saved PNG has the
  frame + stickers + thumbnails, no today disc, and the title toggle visibly works; checked on a
  decorated month, an empty month, and once with the frame `'none'`; no editor freeze mid-scroll.
  Build `/dev/export` so the owner can run it; **do not block on it yourself.**

When it is green, stop and report; the owner merges `m9-export` → `master` and runs the Tier-2 gate.
