# M5 build kickoff prompt (paste into a fresh session)

---

Build **M5 — Stamper / cutter (US-6)** for Javi's Journal. The design is fully resolved.

**Read first, in order:**
1. `AGENTS.md` / `CLAUDE.md` (project guide — note: this is Next.js v16.x, NOT the one you
   know; read `node_modules/next/dist/docs/` before touching `src/app/**`).
2. `Wiki Javi's Journal/plans/M5-PLAN.md` — the plan you are executing. Follow it. Its Tasks
   0–6, DAG, "Resolved design decisions," and Definition of done are authoritative.
3. Skim the M3 image layer you will reuse: `src/lib/image/ingest.ts`, `storage-paths.ts`,
   `thumb-url.ts`, `process.ts`, `src/lib/sync/push.ts` (the `flush()` images branch),
   `src/lib/db/index.ts`, `src/lib/db/image-types.ts`.

**Critical context — the cutter is DESTRUCTIVE (baked):** M5 reverses the committed
non-destructive model. On Cut, bake the framed+masked photo to **WebP-alpha** pixels (2
resolutions: ~2048 closeup + 256 grid, PNG fallback), store via M3's `images` table + bucket;
the raw photo is transient/discarded, no crop transform is stored. The top-level
`PLAN.md`/`DESIGN.md`/`SCHEMA.md` still describe the OLD model — **Task 0 rewrites them; until
then trust M5-PLAN.md over those docs.** Cut returns only `onConfirm(image_id)`; placement /
3-cap / ALG-8 / entries are M6, out of scope.

**Setup:** create a git worktree `m5-stamper` off the current `ui-design` tip and build there.
(M4 builds simultaneously on a separate `m4-calendar` worktree — don't touch its surface; the
only likely shared files are `src/lib/db/index.ts` and `src/lib/db/types.ts`.)

**How to build:** directly, one thread — **do NOT use `/parallel-plan`** (the cutter is one
interdependent UI spine, and the codex worktree agents already failed on M2/M3). Work Task 0 →
1 → 2 → 3 → 4 → 5 → 6 in order.

**Per-task rules:**
- Package manager is **pnpm** (no npm/yarn, no `package-lock.json`).
- `pnpm lint` and `pnpm build` must pass at the end of every task; `pnpm test` by end of
  Task 6.
- Reuse the M3 image/upload layer — extend it for `.webp` / `kind:'stamp'`; do not fork a
  parallel upload path. Keep `push.ts`/`pull.ts` gesture/timer-agnostic (scheduling stays in
  `engine.ts`). Blobs never enter a synced table.
- Commit per task with a conventional message (`feat:`/`chore:`/`fix:`/`docs:`). **Do NOT add
  a `Co-Authored-By` trailer** (repo convention).
- No new Supabase schema/env/migration in M5 (the `images` table + private bucket exist from
  M1; M5 writes no `stamps`/`entries`).

**Verification:**
- Tier-1 (you): the vitest battery in the plan's Definition of done — especially the
  rotation-aware **coverage clamp** no-gap invariant (`rotation × mask-aspect × image-aspect`),
  the bake format/resolution, `ingestStamp` fail-closed, `getCloseupUrl`, and the webp
  `flush()` upload path. Confirm no M2/M3 regression.
- Tier-2 is **owner-run** (a real-phone gate: HEIC + large JPEG × 4 masks, preview==bake, no
  blank corner at any rotation, upload durable, cross-device resolve). Build `/dev/stamper` so
  the owner can run it; don't block on it yourself.

When all tasks are green, stop and report; the owner merges `m5-stamper` → `ui-design` and
runs the Tier-2 gate.

---
