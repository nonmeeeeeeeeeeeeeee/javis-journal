# M3 — Image pipeline (compression half of US-13) — Execution Plan

Resolved via grill session 2026-07-09. This is the plan the build phase executes.

## Goal
Deliver the **compression + upload half of US-13** ("no long-run freeze" + the upload-size
fix) as a **headless, testable image layer** — there is no cutter (M5), day editor (M6), or
sticker tray (M7) yet to place an image on, so M3 produces no `stamps`/`placed_stickers`
rows. What it does produce:

1. **ALG-1 pipeline** (`processImage`) — a picked `File` → `{ mainBlob (~2048px JPEG q0.8 /
   PNG for stickers), thumbBlob (256px), width, height }`, run in a Web Worker so the UI
   thread never janks.
2. A **local blob store** (new Dexie `image_blobs` table) holding original + main + thumb,
   sync-invisible, with **3-day original eviction** behind an upload-durability interlock.
3. An **ingest + upload flow** that mints the `images` row, writes blobs locally, and pushes
   two Storage blobs + the row to Supabase — closing the seam M2 deferred (`images` was
   pull-only; it becomes push-capable).
4. A **display helper** (`image_id` → 256px thumb URL) with local-first resolution, signed-URL
   fallback + lazy backfill, and the object-URL revocation discipline ALG-6 requires.
5. A **dev-only harness route** (`/dev/image-pipeline`) to exercise pick → process → upload →
   display by hand.
6. **Tier-1 vitest** coverage of everything that isn't raw pixels.

The month/day grid that consumes the display helper is M4+; M3 only ships the helper.

## Ground rules for every task
- **This is NOT the Next.js you know (v16.x).** Before touching `src/app/**` (the harness
  route) or adding a Worker, read the relevant guide under `node_modules/next/dist/docs/`.
  Heed deprecation notices. Turbopack supports
  `new Worker(new URL('./x.worker.ts', import.meta.url))` natively — use that, no loader shims.
- **Package manager is pnpm.** No npm/yarn, no `package-lock.json`.
- Reuse existing types verbatim: `ImageRow` from `src/lib/db/types.ts`, the `sync_outbox` /
  `sync_meta` shapes from `src/lib/db/sync-types.ts`. Add new `image_blobs` / handle types
  alongside them; do not redefine existing shapes.
- Keep `push.ts` / `pull.ts` **gesture- and timer-agnostic** (M2's contract): all scheduling
  stays in `engine.ts`. The images-upload branch is added inside `flush()`, not a new loop.
- Blobs **never** enter a synced table. The push engine must never see an `image_blobs` row.
- `pnpm lint` and `pnpm build` must pass at the end of every task; `pnpm test` must pass by
  the end of Task 6.

## Definition of done

**Tier 1 — automated (`pnpm lint`, `pnpm build`, `pnpm test` all green):**
- Pipeline **geometry** unit tests: `fitLongestEdge` and step-down pass count for portrait,
  landscape, square, sub-cap, and over-cap inputs.
- **HEIC magic-byte detection** over crafted `ftyp`/`heic`/`heix`/`mif1` vs JPEG/PNG byte
  arrays (extension/MIME are ignored).
- **Storage path derivation** is a pure function of `(uid, id, kind)` and satisfies the
  bucket RLS (`{uid}/…`).
- **Upload flow** (mock Supabase Storage + PostgREST, `fake-indexeddb`): `ingest → flush`
  clears the outbox and writes the `images` row + both blobs; a forced Storage/row error
  quarantines only that image while the rest of the batch proceeds; a network error backs
  off and leaves it dirty (reusing M2's backoff harness); a retry after partial failure is
  idempotent (deterministic paths, upsert-on-id).
- **Eviction interlock**: original is kept while an `("images", id)` outbox row exists; kept
  before 72h; dropped only when age ≥ 72h **and** the upload is durable (no pending/quarantined
  outbox row); `main`/`thumb` always retained.
- **Display**: local blob resolves first; signed-URL fallback caches with a 24h TTL and
  re-mints on expiry; `release()` revokes an object URL exactly once (no-op for signed URLs);
  LRU cap revokes the oldest live object URL.
- **In-flight dedupe** prevents a concurrent double-pick of one `File` from double-ingesting.
- Pipeline failure is **fail-closed**: a decode/transcode error throws `ImagePipelineError`
  and writes nothing (no `images` row, no `image_blobs`, no outbox entry).
- **No regression** to M2's sync tests.

**Tier 2 — owner-run browser gate (hard gate; no node-canvas substitute):**
- Via `/dev/image-pipeline`, run **one iPhone HEIC and one large (~15–20MB) JPEG** through
  the full loop: pick → thumb renders **upright** (EXIF baked) → uploads → the `images` row
  appears in Supabase and both blobs in the private bucket → reload renders from the local
  blob → clearing that id's `image_blobs` (second-device simulation) re-resolves the thumb via
  a signed URL and backfills it locally.
- `pnpm dev` runs with no runtime error from the new worker or the eviction hook in the sync
  loop. (Pixel-*perfect* cut fidelity is **M5's** gate, not M3's.)

---

## Resolved design decisions
(Full rationale in the grill session; summarized here for implementers.)

1. **Scope is headless.** Six deliverables above; no stamp/sticker/cutter work. M3 *does*
   touch M2's push engine (the deferred images-upload path) — that is in-scope and the
   hardest part.
2. **Local blob store = new `image_blobs` Dexie table** (Dexie `version(2)`, additive store),
   keyed by the client-minted `image_id`:
   `{ id, original: Blob | null, main: Blob, thumb: Blob, kind: 'photo'|'sticker', createdAt:number }`.
   Separate table (not columns on `images`) so blobs stay entirely outside the sync surface.
   `original` is device-local: full on the ingesting device, `null` on a device that only
   pulled the row (there `main` is the re-fit source, per ALG-2).
3. **Original eviction from day one**, 72h retention, with a **durability interlock**: an
   original is dropped only when `createdAt` ≥ 72h old **and** its upload is confirmed
   (no `("images", id)` row pending or quarantined in `sync_outbox`). Never evict an original
   whose `main` hasn't reached Storage — that is the only full-quality copy. `evictOriginals()`
   runs on sync-loop start and after each successful flush; only `original` is nulled.
   Retention clock is measured from ingest (`createdAt`).
4. **Pipeline runs in a Web Worker + OffscreenCanvas**, with a **main-thread fallback** when a
   worker-side `OffscreenCanvas` is absent. Pipeline core is a pure `async` fn
   (`bitmap/File → {main,thumb,w,h}`) that both the worker wrapper and vitest call directly.
5. **HEIC**: try `createImageBitmap` first (Safari/iOS decodes natively); detect HEIC by
   **magic bytes** (`ftyp` brand `heic`/`heix`/`mif1`), never by extension/MIME; transcode via
   **`heic2any`** loaded through a lazy dynamic `import()` only on the non-decoding path, so its
   wasm never ships to the iPhone. `libheif-wasm` is the documented fallback if `heic2any`
   proves flaky.
6. **Decode cap**: inputs over ~40MP or ~40MB are decoded at reduced resolution via
   `createImageBitmap`'s `resizeWidth`/`resizeQuality`, then stepped down — caps peak memory and
   stays under iOS canvas-area limits.
7. **Upload plugs into the existing `sync_outbox`/engine** (not a parallel queue): add
   `table: 'images'`, `op: 'upload'`. `ingestImage` writes the local `images` + `image_blobs`
   rows then `markDirty('images', id, 'upload')`. That outbox row is also the durability signal
   for decision 3.
8. **Deterministic idempotent Storage paths**: main `{uid}/{id}.jpg|.png`, thumb
   `{uid}/{id}_thumb.jpg`. Retries overwrite the same path. RLS-valid (`foldername[1]===uid`).
9. **`flush()` gets an images branch, run BEFORE the LWW tables.** Per image: load
   `image_blobs` (missing → quarantine) → `storage.upload(main,{upsert:true})` →
   `storage.upload(thumb,{upsert:true})` → `images` upsert-on-`id` → `clearDirty`. Every step
   idempotent, so a retry re-running all steps is always safe. Network failure → throw →
   existing backoff; non-network error → quarantine that one image. Images-first establishes
   the ordering contract M5/M6/M7 need (a `stamps.image_id` FK can only resolve after the
   image row lands).
10. **Idempotency**: upsert-on-`id` only; the deterministic path makes a `storage_path` UNIQUE
    collision impossible. A retry after a row-insert failure **re-PUTs both blobs** — accepted
    for M3 (blobs are ≤~2MB, retries rare); sub-step progress flags are a noted future
    optimization.
11. **Display helper (`src/lib/image/`, framework-agnostic; M4 wraps it in a hook):**
    - `getThumbUrl(imageId)` / batch `getThumbUrls(ids)`: resolve local `image_blobs.thumb`
      first (`URL.createObjectURL`); else sign `images.thumb_path`, download the blob into
      `image_blobs` (lazy backfill → steady-state renders are local + offline-capable).
    - Signed-URL cache: **in-memory** `Map<id,{url,expiresAt}>`, **24h TTL**, batch
      `createSignedUrls` for a whole month in one round-trip.
    - Returns a **handle `{ url, release() }`**; `release()` revokes the object URL (no-op for
      signed URLs). An **LRU cap** on simultaneously-live object URLs bounds memory even on a
      caller bug (ALG-6).
    - `main` blob is fetched lazily only when the cutter (M5) needs it, never in the grid.
12. **Duplicate picks**: in-flight/double-tap dedupe only (an in-flight guard on the pick).
    **Content dedupe across separate picks is DEFERRED** past M10 — intentional duplicates are
    legitimate (same photo, two crops → sharing an `image_id` is the correct model) and the
    free-tier quota has years of headroom.
13. **Verification is two-tier**: Tier-1 vitest for all non-pixel logic (reusing M2's
    `vitest` + `fake-indexeddb` + mock-Supabase harness); Tier-2 an owner-run browser pass via
    the dev harness for the irreducible decode/encode/EXIF/worker path. **No `@napi-rs/canvas`
    / `node-canvas`** — a node canvas impl would test different pixels than Javi's phone.

---

## DAG
```
Task 1 (Dexie v2 image_blobs + outbox 'images'/'upload') ─┬─► Task 3 (ingest + eviction) ─┐
Task 2 (pipeline core + worker) ──────────────────────────┘                               │
                                                                                          ├─► Task 6
Task 1 ─► Task 4 (upload branch in flush) ────────────────────────────────────────────────┤   (harness +
Task 1 ─► Task 5 (display helper) ────────────────────────────────────────────────────────┘   engine wiring +
                                                                                              integration + Tier-2)
```
Leaves are **Task 1** and **Task 2** (independent). Once Task 1 lands, **Tasks 4 and 5** are
mutually independent (upload-push vs read-side) and parallelizable; **Task 3** needs Tasks 1+2.
**Task 6** converges everything. Tasks 4/5 (and 1/2) are the genuine parallel-plan candidates;
Task 3 and the flush branch both reason about the outbox, so if parallelized, watch the shared
`push.ts`/`outbox.ts` edits (M2's known worktree-merge hazard — review→apply→verify on master).

---

## Task 1 — Dexie v2: `image_blobs` + outbox extension  *(leaf · blocks 3, 4, 5)*
**Files:** `src/lib/db/index.ts`, `src/lib/db/image-types.ts` (new), `src/lib/db/sync-types.ts`,
`src/lib/sync/outbox.ts`

1. Add `ImageBlobRow` type (decision 2) in `src/lib/db/image-types.ts`.
2. Bump `JournalDB` to `this.version(2)` with an **additive** `image_blobs: "id, createdAt"`
   store (v1 stores unchanged — Dexie carries them forward, no data migration). Index
   `createdAt` for the eviction scan.
3. Extend the outbox to allow images uploads: `SyncOutboxRow['op']` gains `'upload'`; the
   `SyncTable` union in `outbox.ts` gains `'images'`. Keep `markDirty/clearDirty/quarantine/
   getPending` working unchanged for the new `('images', id, 'upload')` shape.
4. Do **not** add `image_blobs` to `sync_meta` or any pull path — it is never synced.

## Task 2 — Pipeline core + worker (ALG-1)  *(leaf · parallel with Task 1)*
**Files:** `src/lib/image/geometry.ts`, `src/lib/image/heic.ts`, `src/lib/image/process.ts`,
`src/lib/image/pipeline.worker.ts`, `src/lib/image/host.ts`

1. `geometry.ts` — pure: `fitLongestEdge(w,h,cap)`, step-down pass planning, thumb dims. No
   canvas import (Tier-1 tested).
2. `heic.ts` — `isHeic(bytes)` magic-byte check; `heicToJpeg(file)` behind a lazy
   `import('heic2any')`. Add `heic2any` via `pnpm add heic2any`.
3. `process.ts` — pure `processBitmap(source, kind)`: `createImageBitmap(file,{imageOrientation:
   'from-image'})` (EXIF baked) with the decode cap (decision 6), stepped-halving downscale,
   `convertToBlob` (`image/jpeg` q0.8 for photos, `image/png` for stickers) for main + 256px
   thumb; close bitmaps promptly. Throws `ImagePipelineError` on failure.
4. `pipeline.worker.ts` + `host.ts` — worker wraps `processBitmap`; `host.ts` feature-detects
   worker `OffscreenCanvas` and falls back to running `processBitmap` on the main thread.
   `processImage(file, kind)` is the public entry that returns `{mainBlob, thumbBlob, width,
   height}`.

## Task 3 — Ingest + local blob store + eviction  *(depends on 1 + 2)*
**Files:** `src/lib/image/ingest.ts`, `src/lib/image/eviction.ts`

1. `ingestImage(file, kind)`: in-flight-dedupe guard → `processImage` → mint `id =
   crypto.randomUUID()` → write `image_blobs` (`original` = the picked file, `main`, `thumb`) →
   write the local `images` row (`storage_path`/`thumb_path` from decision 8, `mime`,
   `byte_size`, `width`, `height`) → `markDirty('images', id, 'upload')`. Fail-closed: on
   pipeline error, throw `ImagePipelineError` and write nothing.
2. `evictOriginals()`: scan `image_blobs.where('createdAt').below(now-72h)`, keep any with a
   live `('images', id)` outbox row (pending or quarantined) or `original == null`; for the
   rest set `original = null`. Only `original` is touched.

## Task 4 — Upload branch in `flush()`  *(depends on 1 · parallel with 5)*
**Files:** `src/lib/image/storage-paths.ts`, `src/lib/sync/push.ts`

1. `storage-paths.ts` — pure `mainPath(uid,id,kind)` / `thumbPath(uid,id)`.
2. In `flush()`, add an **images branch run before `LWW_TABLES`** (decision 9): for each
   pending `('images', …)` outbox row — load `image_blobs` (missing → quarantine),
   `storage.from('images').upload(path, blob, { upsert:true })` for main then thumb,
   `supabase.from('images').upsert(imageRow)` on `id`, then `clearDirty`. Reuse the existing
   network-vs-row error discipline (`PushNetworkError` throws for backoff; other errors
   quarantine that one image and continue).

## Task 5 — Display helper  *(depends on 1 · parallel with 4)*
**Files:** `src/lib/image/thumb-url.ts`

1. `getThumbUrl(imageId)` / `getThumbUrls(ids)` per decision 11: local-blob-first, signed-URL
   fallback + lazy backfill into `image_blobs`, in-memory signed-URL cache (24h TTL, batch
   sign), handle `{ url, release() }`, LRU cap on live object URLs.

## Task 6 — Harness route + engine wiring + integration & Tier-2  *(depends on 3, 4, 5)*
**Files:** `src/app/dev/image-pipeline/page.tsx`, `src/lib/sync/engine.ts`,
`src/lib/image/*.test.ts`, `src/lib/sync/*.test.ts`

1. `/dev/image-pipeline` — dev-only guard (404/redirect in production). Pick a file → run
   `ingestImage` → inspect detected type / HEIC-transcoded, main dims+bytes, thumb preview,
   original-retained flag, live upload status, and thumb source (local vs signed). A button to
   force `evictOriginals()` and one to clear an id's `image_blobs` (second-device sim).
2. Wire `evictOriginals()` into `engine.ts`: call on `startSyncLoop()` start and after each
   successful `flush()`.
3. Tier-1 vitest across geometry, HEIC detect, paths, upload happy/poison/network-backoff,
   eviction interlock, display cache/handle/LRU, in-flight dedupe, fail-closed — reusing M2's
   mock-Supabase + `fake-indexeddb` harness (extend the mock to cover `storage.from().upload`
   and `createSignedUrl(s)`).
4. Tier-2: run the owner browser gate (one HEIC + one large JPEG through the full loop).

---

## Manual steps (owner — not for agents)
- **Tier-2 browser gate** (Definition of done): owner-run, on a real device where possible
  (the whole US-13 promise is "works on her actual phone"). Chrome-automation may assist, but a
  real iPhone HEIC through the loop is the meaningful check.
- **No new Supabase schema or env vars** — the `images` table and the private `images` bucket
  (folder-scoped RLS) already exist from M1. Nothing to run in the Supabase console.
