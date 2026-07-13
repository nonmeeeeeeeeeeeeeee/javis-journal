# M6 build kickoff prompt (paste into a fresh session)

---

Build **M6 — Day editor + punch machine (US-7, US-8)** for Javi's Journal. The design is fully
resolved.

**Read first, in order:**
1. `AGENTS.md` / `CLAUDE.md` (project guide — note: this is Next.js v16.x, NOT the one you
   know; read `node_modules/next/dist/docs/` before touching `src/app/**`).
2. `Wiki Javi's Journal/plans/M6-PLAN.md` — the plan you are executing. Follow it. Its Tasks
   0–7, DAG, the 21 "Resolved design decisions," and the Definition of done are authoritative.
3. Skim what you will reuse and touch: `src/lib/calendar/fit.ts` (`CELL_ASPECT` — the day
   page's geometry), `src/lib/db/queries.ts` + `mutations.ts` (the only read/write seams),
   `src/lib/image/thumb-url.ts` (`getThumbUrls` / `getCloseupUrl`), `src/components/calendar/*`
   (`Calendar.tsx`, `DayCell.tsx`), `src/components/Stamper.tsx` + `src/lib/stamp/*` (M5's
   cutter — you are reworking its UI), `src/lib/sync/push.ts` + `outbox.ts` (`markDirty`).

**Critical context — two reversals. Trust M6-PLAN.md over the top-level docs until Task 0
rewrites them:**
- **DESIGN's ALG-9 long-press *menu* is dropped.** Stamp editing is direct manipulation:
  long-press selects (blue shadow); only then does drag/pinch/twist work; a short tap on any
  stamp toggles front/back; a floating ✕ on the selection deletes (with an Undo toast). No
  menu, no resize mode, no handles.
- **M5's placeholder pastel Stamper becomes the skeuomorphic punch machine** (asset:
  `C:\Users\olgui\OneDrive\Imágenes\javis-journal\punch-model\punch-javis-journal.png`; its
  window is a **verified transparent hole**, so the preview canvas sits *behind* the art). M5's
  rotate-*mode* toggle and −/+ steppers are **retired** in favour of two-finger pinch/twist in
  the window. Cut = pressing the drawer plate.

Also load-bearing: the day page is the **7:6 calendar cell zoomed** (reuse `CELL_ASPECT`, do
not invent an aspect); `pos`/`scale` are normalized to that box; the calendar cell renders the
**same** `stampBoxes` composition at thumb size. M6 is the **first writer of `entries` /
`stamps`** — an abandoned pick or a failed bake must write **nothing** (no orphan entry).

**Setup:** branch `m6-day-editor` off `master`.

**How to build:** directly, one thread — **do NOT use `/parallel-plan`** (M6 is one
interdependent spine, and the codex worktree agents already failed on M2/M3). Work Task 0 → 1 →
2 → 3 → 4 → 5 → 6 → 7 in order.

**Per-task rules:**
- Package manager is **pnpm** (no npm/yarn, no `package-lock.json`).
- `pnpm lint` and `pnpm build` must pass at the end of every task; `pnpm test` by end of Task 7.
- Respect the seams: components never call `db.*` or Supabase directly — reads via
  `queries.ts`, writes via `mutations.ts` (`markDirty` only), images via `thumb-url.ts`.
  Scheduling stays in `sync/engine.ts`; blobs never enter a synced table.
- **Every object URL is released** (day-page closeups on overlay close) — ALG-6 is the freeze
  fix, and there is a canary test for it.
- **Write once per gesture, on gesture-end** — never per animation frame.
- All tunable placement numbers live in the single `PLACEMENT` object in `src/lib/day/place.ts`;
  no magic numbers elsewhere. Tests assert invariants, not the constants.
- Commit per task with a conventional message (`feat:`/`chore:`/`fix:`/`docs:`). **Do NOT add a
  `Co-Authored-By` trailer** (repo convention).

**Task 0 has a real migration** (`alter table stamps drop column crop_offset_x, crop_offset_y,
crop_scale` — keep `mask_type`) plus **Dexie v4**. Migrations are **not** auto-applied to hosted
Supabase; write it, and tell the owner to run `supabase db push` (that is an owner step).

**Verification:**
- Tier-1 (you): the vitest battery in the plan's Definition of done — placement invariants
  (always inside the 7:6 page, 3-cap), `stampBoxes`, hit-testing (the transparent-corner case),
  45° snap, the atomic entry+stamp write and its fail-closed path, soft-delete + undo
  (restoring the original `layer_order`), the front/back tap toggle, the `PUNCH_WINDOW`
  calibration, **pinch isolation** (a day-page pinch must not switch the calendar view), and
  the **object-URL canary** (open/close a day 50× → flat). Confirm no M2/M3/M4/M5 regression.
- Tier-2 is **owner-run** (a real-phone gate: pick → punch → cut → placed; cascade + FAB hidden
  at 3; long-press/drag/pinch/twist/snap; tap = front/back; ✕ + Undo; back gesture closes the
  day; second-device match). Build `/dev/day` so the owner can run it; don't block on it
  yourself.

When all tasks are green, stop and report; the owner pushes the migration, merges
`m6-day-editor` → `master`, and runs the Tier-2 gate.

---
