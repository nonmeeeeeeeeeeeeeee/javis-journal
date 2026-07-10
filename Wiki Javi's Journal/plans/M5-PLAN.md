# M5 — Stamper / cutter (US-6) — Execution Plan

Resolved via grill session 2026-07-10. This is the plan the build phase executes.

> **Headline reversal recorded here:** M5 switches the cutter from the **non-destructive**
> transform model (committed in PLAN/DESIGN/SCHEMA) to a **destructive baked** model. The
> rationale and the doc updates this forces are Task 0 below. Read "Resolved design
> decisions" before implementing.

## Goal
Deliver **US-6 (the stamper / cutter machine)** as a **headless, testable stamp layer**
behind a dev harness — there is no calendar (M4), day page, placement, or 3-cap (M6) yet to
put a stamp on, so M5 produces **no `entries` / `stamps` rows and no placement**. What it
does produce:

1. **The cutter engine** — a picked `File` → framed behind a shape mask (pan / zoom /
   rotate) → **baked** to a masked WebP-alpha stamp at two resolutions.
2. **The 4 masks** — `postage · cloud · spiky · heart`, authored as SVG-path→`Path2D`
   alphas (crisp at any bake size), each with a fixed intrinsic aspect.
3. **The stamper UI** — clean, pastel-token, functional: mask window, ‹ › shape cycle,
   pan/zoom, a **Rotate-mode button**, and a Cut action. Skeuomorphic art + cut
   animation/sound are **M10 (US-14)**, not here.
4. **Bake + persist** — the baked stamp flows through M3's existing `images` row + private
   bucket + `flush()` upload branch as a `.webp`; a new `image_blobs.kind: 'stamp'` holds
   the closeup + thumb blobs locally.
5. **`getCloseupUrl()`** — a read-side helper (local-first + signed-URL fallback + lazy
   backfill, mirroring `getThumbUrl`) so a day page can later show the 2048 baked stamp.
   This repurposes the "M5 cutter lazily downloads `main`" seam M3 left open.
6. **A dev-only harness** (`/dev/stamper`) to exercise pick → frame → cut → bake → upload →
   display → cross-device-resolve by hand.
7. **Tier-1 vitest** over everything that isn't raw pixels.

The result M5 hands its caller is exactly **`onConfirm(image_id)`** — the baked stamp's
image id, nothing else. Placement (`pos/scale/rotation_deg/layer_order`), entries, the
3-cap, and ALG-8 auto-place are **M6**.

## Ground rules for every task
- **This is NOT the Next.js you know (v16.x).** Before touching `src/app/**` (the harness
  route) read the relevant guide under `node_modules/next/dist/docs/`. Heed deprecation
  notices.
- **Package manager is pnpm.** No npm/yarn, no `package-lock.json`.
- **Reuse the M3 image layer; don't fork it.** The bake output is ingested through the same
  `images` table, `storage-paths`, and `flush()` images-branch that M3 built. Extend them
  for `.webp` / `kind:'stamp'`; do not stand up a parallel upload path.
- Keep `push.ts` / `pull.ts` **gesture- and timer-agnostic** (M2's contract): all scheduling
  stays in `engine.ts`.
- Blobs **never** enter a synced table. The push engine must never see an `image_blobs` row.
- The **raw picked photo is transient** — decoded to feed the cutter, then discarded on
  confirm. Only the baked stamp persists/uploads. No source upload, no 72h-original
  bookkeeping for stamps.
- `pnpm lint` and `pnpm build` must pass at the end of every task; `pnpm test` must pass by
  the end of Task 6.
- **Build:** direct, single-thread, on an `m5-stamper` git worktree off the current
  `ui-design` tip — **not** `/parallel-plan` (the cutter is one interdependent UI spine, and
  the codex worktree agents already failed on M2/M3). M4 runs simultaneously on its own
  `m4-calendar` worktree. Merge each back to `ui-design` when green; the owner verifies.
  Only likely shared touch-points with M4: `src/lib/db/index.ts`, `src/lib/db/types.ts`.

## Definition of done

**Tier 1 — automated (`pnpm lint`, `pnpm build`, `pnpm test` all green):**
- **Coverage clamp** (the no-blank-corner invariant): for a battery of `(rotation ×
  mask-aspect × image-aspect)` cases — angles `0,15,30,45,60,90,…`, portrait/landscape/square
  images, each mask's fixed aspect — the computed min-zoom keeps the (rotated) sampling rect's
  axis-aligned bounding box **fully inside** the source image. A stamp can never bake a
  transparent gap. Rotating at min-zoom auto-bumps zoom to the angle's min-cover.
- **Pan clamp:** at a given `(scale, rotation)`, the pan offset is clamped so the sampling
  rect stays within the image bounds.
- **Fit / window geometry:** mask-window sizing from a fixed aspect; baked closeup/thumb dims.
- **Bake spec:** format selection picks `image/webp` when supported and falls back to
  `image/png` otherwise; resolution targets are ~2048 (closeup) + 256 (grid); WebP quality
  0.8.
- **Storage-path derivation** for the baked stamp is a pure function of `(uid, id)` yielding
  `.webp` (or `.png` fallback) paths that satisfy the bucket RLS (`{uid}/…`).
- **Baked-blob ingest:** cut → writes the `images` row + `image_blobs` (`kind:'stamp'`,
  closeup + thumb) + an `('images', id, 'upload')` outbox marker atomically, then schedules a
  flush; a decode/bake failure is **fail-closed** (throws `ImagePipelineError`, writes
  nothing). The existing `flush()` images-branch uploads the `.webp` blobs; reuse M3's
  network-backoff / poison-pill-quarantine discipline for the webp path.
- **Display:** `getCloseupUrl(id)` resolves the local `image_blobs` closeup first, else signs
  `images.storage_path`, backfills locally, caches with the 24h TTL, and returns a
  `{ url, release() }` handle under the same LRU cap as `getThumbUrl`.
- **No regression** to M2's sync tests or M3's pipeline/upload/eviction tests.

**Tier 2 — owner-run browser gate (hard gate; no node-canvas substitute):**
Via `/dev/stamper`, on a real phone where possible:
- Run **one iPhone HEIC and one large (~15–20MB) JPEG** through the full loop for **each of
  the 4 masks**: pick → frame with pan / zoom / **rotate mode** → **Cut**.
- **The baked stamp matches the live preview exactly** — no shift between what she framed and
  what bakes (the US-6 "matches the preview" gate; single-moment, single-device, but must be
  pixel-faithful).
- **No blank/transparent corner at any rotation** — rotate to several angles and confirm the
  coverage clamp held.
- Thumb/closeup render **upright** (EXIF baked) → uploads → the `images` row appears in
  Supabase and both `.webp` blobs in the private bucket → reload renders from the local baked
  blob → clearing that id's `image_blobs` (second-device sim) re-resolves closeup + thumb via
  signed URLs and backfills locally.
- `pnpm dev` runs with no runtime error from the cutter or the harness route.

---

## Resolved design decisions
(Full rationale in the grill session; summarized here for implementers.)

0. **DESTRUCTIVE (baked) cutter — reverses a headline decision.** On Cut, we bake the masked,
   framed photo to pixels and store **that**; we do **not** store a crop transform and we do
   **not** keep the source photo. Accepted trade-off: a stamp can **never** be re-framed,
   re-cropped, or re-masked after cutting — fixing one is delete + redo from the photo (M6).
   This is the behavior the owner wants ("no changes to the stamp image after it's created").
   In exchange we get: the app's #1 risk (preview==export across zoom/pan/DPR — the "main bug
   source") largely evaporates (bake once, keep the pixels); a simpler `stamps` schema (no
   crop columns); and simpler, faster display (draw a bitmap, no live compositing). Storage is
   comparable-or-smaller than non-destructive: a baked stamp stores only the **visible cut**
   (not the whole 2048 source), as lossy WebP-alpha, and there is no separate source blob.
1. **Scope is headless (US-6 only).** Deliverables 1–7 above. No `entries`/`stamps` rows, no
   placement, no 3-cap, no ALG-8 — all M6. The cutter's output to its caller is
   `onConfirm(image_id)`.
2. **In-cutter rotation, continuous, mode-toggled.** The cutter rotates the **photo behind an
   upright mask window** (the mask outline stays upright; the photo tilts), continuously (any
   angle). It is a **mode**, not an ambient twist: tap the **Rotate** button → the drag
   surface becomes rotation (slide the finger up/down/left/right to rotate) → tap to exit back
   to pan/zoom. This kills the "always-on twist is tedious / accidental" problem. Because we
   bake, the angle needs **no** stored field — it lives in the baked pixels. (Separately,
   M6's `rotation_deg` — 45°-snapped — later rotates the **whole** baked stamp on the day.)
3. **Coverage guarantee (no blank corners).** The mask window is always fully covered by the
   photo. Min-zoom is a **function of rotation angle** (a rotated sampling rect inscribes a
   smaller region — at 45° coverage shrinks ~√2). Entering/continuing rotate mode auto-bumps
   zoom to the angle's min-cover if needed. Purely a live cut-time concern — no persistence,
   no sync.
4. **Masks = SVG-path d-strings → `Path2D`.** Each mask is a path string filled onto an alpha
   canvas via `new Path2D(d)`, rasterized at whatever size preview/bake needs — crisp
   anti-aliased edges at any bake resolution, ~KB of data, easy to tweak. **Ship 4:**
   `postage · cloud · spiky · heart`. **Postage** is special: a rectangular alpha window plus
   a **perforated frame path drawn `source-over`** on top of the bake. circle/square/oval are
   deferred to a later polish pass (the schema `mask_type` CHECK already allows all 7, so this
   is forward-compatible).
5. **Fixed intrinsic aspect per mask.** Each mask has a committed aspect ratio (heart ~1:1,
   postage ~3:4, cloud wide, spiky …), so the mask window — and the baked stamp's aspect — is
   deterministic. Keeps coverage math and M6's later max-fit placement simple.
6. **Bake output = WebP-alpha, q0.8, two resolutions.** A ~2048px longest-edge **closeup**
   (day page) + a 256px **grid** thumb, mirroring the M3 `main`+`thumb` pair. **PNG-alpha
   fallback** when `convertToBlob('image/webp')` is unsupported (older iOS Safari). Reuse the
   stepped-halving downscale from M3's `process.ts` where useful, but the bake source is the
   masked canvas, not a downscale of the raw pick.
7. **Reuse the M3 image/upload layer.** The baked stamp is ingested like any image: mint
   `id = crypto.randomUUID()`, write `image_blobs` (`kind:'stamp'`, `original:null`,
   closeup as `main`, `thumb`), write the `images` row (`mime:'image/webp'` | `'image/png'`,
   `storage_path`/`thumb_path` from the extended path helper, `width`/`height` = baked closeup
   dims, `byte_size`), `markDirty('images', id, 'upload')`, `scheduleFlush()`. The existing
   `flush()` images-branch uploads both blobs + the row, idempotently.
8. **Raw photo is transient.** Decode/EXIF-fix the pick via M3's `processImage` (or a
   lighter decode) to feed the cutter; keep it only for the session; **discard on confirm**.
   Never upload the source; no `original`, no 72h eviction clock for stamps.
9. **`getCloseupUrl()` mirrors `getThumbUrl()`.** Local `image_blobs` (closeup/`main`) first;
   else sign `images.storage_path`, download+backfill, cache 24h, return `{url, release()}`
   under the LRU cap. `getThumbUrl`'s backfill `kind` inference must learn `image/webp`
   (→ `'stamp'`). The grid keeps using `getThumbUrl` (256 thumb); only the day page (M6) uses
   the closeup.
10. **Chrome now, delight later.** M5 ships a clean, correct, pastel-token stamper. The
    skeuomorphic stamp-machine art and the cozy cut **animation + sound** are **M10 (US-14)**;
    `onConfirm` leaves the seam. Degrade gracefully — the cut must never wait on a flourish.
11. **Verification is two-tier** (mirroring M3): Tier-1 vitest for all non-pixel logic
    (reusing M2/M3's `vitest` + `fake-indexeddb` + mock-Supabase harness, extended for webp
    upload); Tier-2 an owner-run browser pass for the irreducible decode/bake/EXIF/coverage
    path. **No `@napi-rs/canvas` / `node-canvas`** — a node canvas would bake different pixels
    than Javi's phone.

---

## Task 0 — Doc reversal (ADR + PLAN/DESIGN/SCHEMA)  *(do first; no code)*
**Files:** `Wiki Javi's Journal/PLAN.md`, `Wiki Javi's Journal/DESIGN.md`,
`Wiki Javi's Journal/SCHEMA.md` (+ this plan is the ADR of record)

1. Record the **non-destructive → destructive** decision as an ADR (this plan's Decision 0
   is the ADR body). Update PLAN's Tech Stack Decision Log entry "Non-destructive cutter" to
   the destructive/baked model and its consequences.
2. Rewrite **DESIGN ALG-2** from "store crop, render live" to "frame → bake masked WebP-alpha
   at two resolutions; the baked stamp is the stored artifact." Note the coverage clamp and
   the rotate-mode interaction. Update FLOW-2/FLOW-3 to `bake → POST /images (webp)`.
3. Update **SCHEMA `stamps`**: crop columns (`crop_offset_x/y`, `crop_scale`) become
   **vestigial** under destructive; `mask_type` is baked-in and demoted to optional metadata.
   Document that the actual column drop is **deferred to M6** (M6 is the first writer of
   `stamps`; the existing columns are harmless until then — no migration is on M5's path).
   `images.mime` gains `'image/webp'`.
4. No Postgres migration and no new env vars in M5 — the `images` table + private bucket
   already exist from M1, and M5 writes no `stamps`/`entries` rows.

## Task 1 — Masks + geometry (pure)  *(leaf · blocks 2, 3)*
**Files:** `src/lib/stamp/masks.ts`, `src/lib/stamp/geometry.ts`

1. `masks.ts` — the 4 mask definitions: `{ id, aspect, path(w,h) → Path2D, frame?(w,h) →
   Path2D }`. `postage.frame` is the perforation drawn `source-over`. Pure/data-only; no
   canvas import beyond `Path2D` construction (guard for test env if needed).
2. `geometry.ts` — pure: `minCoverScale(rotation, maskAspect, imgW, imgH)` (the rotation-aware
   no-gap clamp), `clampPan(offset, scale, rotation, imgW, imgH)`, mask-window sizing, and
   baked closeup/thumb dim derivation. **No canvas** — fully Tier-1 tested.

## Task 2 — Cutter render + bake  *(depends on 1)*
**Files:** `src/lib/stamp/render.ts`, `src/lib/stamp/bake.ts`

1. `render.ts` — `renderFrame(ctx, img, mask, { offX, offY, scale, rotation }, size)`: draw
   the rotated/panned/zoomed photo into a mask-aspect canvas, apply the mask alpha via
   `globalCompositeOperation='destination-in'`, then draw `mask.frame` `source-over` (postage).
   The **single** code path used by both the live preview and the bake, so preview == bake.
2. `bake.ts` — `bakeStamp(img, mask, transform) → { closeupBlob, thumbBlob, width, height,
   mime }`: render at ~2048 + 256, `convertToBlob('image/webp', 0.8)` with a `image/png`
   fallback (feature-detect once). Throws `ImagePipelineError` on failure.

## Task 3 — Cut ingest + display helper  *(depends on 1, 2; reuses M3)*
**Files:** `src/lib/stamp/ingest-stamp.ts`, `src/lib/image/storage-paths.ts`,
`src/lib/image/thumb-url.ts`, `src/lib/db/image-types.ts`

1. Extend `ImageBlobRow.kind` to `'photo' | 'sticker' | 'stamp'`.
2. Extend `storage-paths.ts` to emit `.webp` (or `.png` fallback) for `kind:'stamp'`.
3. `ingestStamp(bakeResult) → id`: mint id, write `image_blobs` (`kind:'stamp'`,
   `original:null`, closeup=`main`, `thumb`) + `images` row + `markDirty('images', id,
   'upload')` atomically, `scheduleFlush()`. Fail-closed. (Mirrors `ingestImage`, minus the
   source blob.)
4. `getCloseupUrl(id)` in `thumb-url.ts` (or a sibling): local-first closeup → signed
   `storage_path` fallback + backfill, 24h cache, `{url, release()}`, shared LRU cap. Teach
   the backfill `kind` inference `image/webp → 'stamp'`.

## Task 4 — Stamper UI (pan/zoom/rotate-mode/mask-cycle)  *(depends on 1, 2)*
**Files:** `src/components/Stamper.tsx` (+ any CSS module), `src/lib/stamp/gestures.ts`

1. `gestures.ts` — pointer handling for the dedicated cutter surface (no ALG-9
   hit-testing — the photo is the only object): drag→pan, pinch/wheel→zoom, and **rotate
   mode** (drag→rotate) toggled by the Rotate button. Applies `clampPan` + `minCoverScale`
   live so no gap can appear.
2. `Stamper.tsx` — controlled component: props `{ file, onConfirm(image_id), onCancel }`.
   Renders the mask window + live preview (canvas via `render.ts`), ‹ › shape cycle over the
   4 masks, zoom, the Rotate-mode button, and Cut. On Cut: `bakeStamp` → `ingestStamp` →
   `onConfirm(id)`. Clean pastel-token chrome; leaves a seam for the M10 cut animation.

## Task 5 — Harness route  *(depends on 3, 4)*
**Files:** `src/app/dev/stamper/page.tsx` (+ client component)

1. `/dev/stamper` — dev-only guard (404/redirect in production). Pick a file → mount
   `Stamper` → on confirm show the baked stamp at both resolutions (closeup via
   `getCloseupUrl`, thumb via `getThumbUrl`), the detected type / HEIC-transcoded flag, baked
   dims + bytes + mime (webp vs png fallback), and live upload status. Buttons to clear an
   id's `image_blobs` (second-device sim) and to re-resolve.

## Task 6 — Tests + integration  *(depends on 1–5)*
**Files:** `src/lib/stamp/*.test.ts`, `src/lib/image/*.test.ts` (extend)

1. Tier-1 vitest across: coverage clamp (the `rotation × aspects` no-gap battery), pan clamp,
   window/bake-dim geometry, bake format-selection + resolution, `.webp` path derivation,
   `ingestStamp` (atomic write + fail-closed), `getCloseupUrl` (local/ signed / backfill /
   LRU / release), and the `flush()` webp-upload path (extend M3's mock-Storage to accept
   webp; assert happy / quarantine / network-backoff). Confirm **no M2/M3 regression**.
2. Run the Tier-2 owner browser gate (Definition of done) — HEIC + large JPEG × 4 masks,
   preview==bake, no-gap-at-rotation, upload durable, cross-device resolve.

---

## DAG
```
Task 0 (doc reversal / ADR) ── do first, no code
Task 1 (masks + geometry, pure) ─┬─► Task 2 (render + bake) ─┬─► Task 3 (cut ingest + display) ─┐
                                 └───────────────────────────┴─► Task 4 (stamper UI) ───────────┤
                                                                                                 ├─► Task 5 (harness) ─► Task 6 (tests + Tier-2)
```
Single interdependent spine — **build directly, one thread** (no `/parallel-plan`). Task 1 is
the only true leaf; everything else chains off the render/bake core. Task 3 (cut ingest) and
Task 4 (stamper UI) both sit on Tasks 1+2 and can be interleaved by one builder, but they are
not worth isolating into worktree agents.

---

## Manual steps (owner — not for agents)
- **Tier-2 browser gate** (Definition of done): owner-run, on a real device where possible —
  the US-6 promise is "the cut looks exactly how she wants on her phone." Chrome-automation
  may assist, but a real iPhone HEIC framed + rotated + cut per mask is the meaningful check.
- **No new Supabase schema or env vars** in M5. The `stamps` crop-column drop and the first
  real `stamps`/`entries` writes are **M6**.
- **Merge discipline:** land `m5-stamper` back onto `ui-design` yourself once `pnpm lint` +
  `pnpm build` + `pnpm test` are green; watch `db/index.ts` / `types.ts` for M4 overlap.
