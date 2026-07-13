# M7 kickoff prompt — Stickers + tray (US-9)

*(Paste everything below the line into a fresh session. It covers BOTH phases: design, then
build — the same process M2…M6 used.)*

---

Work **M7 — Stickers + tray (US-9)** for Javi's Journal, from design through to a merged branch.

## Phase 1 — Design (do this first, before any code)

Run **`/grill-me`** against the M7 slice of the planning docs and resolve every open decision
before writing a line of code. The output is **`Wiki Javi's Journal/plans/M7-PLAN.md`** — a task
DAG, the resolved decisions (with their rationale, since that file is the ADR of record), and a
two-tier Definition of done — written in the same shape as `M6-PLAN.md`. Read `M6-PLAN.md` first
to see the bar.

**Read before grilling:**
1. `AGENTS.md` / `CLAUDE.md` — the project guide. **This is Next.js v16.x, not the one you
   know**: read `node_modules/next/dist/docs/` before touching `src/app/**`.
2. `Wiki Javi's Journal/PLAN.md` (US-9 + the milestone DAG), `DESIGN.md` (ALG-1 sticker path,
   ALG-6, the API surface rows for `sticker_assets` / `placed_stickers`), `SCHEMA.md` (both
   tables already exist — M7 is their **first writer**).
3. `Wiki Javi's Journal/plans/M6-PLAN.md` — **not optional.** M7 inherits M6's interaction
   model, and M6 reversed what DESIGN says.

**Critical context — M6 shipped and it supersedes the older docs:**
- **DESIGN's ALG-9 long-press *menu* is dead.** Editing is **direct manipulation**: long-press
  selects (blue glow), and only then does drag / pinch / twist work; a short tap toggles
  front/back; a floating ✕ deletes with an Undo toast; **one write per gesture, on gesture-end**.
  All of it lives in `src/lib/day/gestures.ts` (`DayGestures`) + `place.ts` / `layout.ts` /
  `hit.ts` (placement, `stampBoxes`, `topElementAt`). US-9's acceptance criteria still say
  "long-press menu" — **that wording is stale; the ADR is M6-PLAN decision 9.**
- **Desktop parity is now a requirement, not a nice-to-have.** A mouse has no second finger, so
  M6 added fine-pointer-only controls (`useFinePointer` in `src/lib/ui/pointer.ts`): a
  bottom-center `− + ⟲ ⟳` bar, wheel-to-scale on the selection, and keyboard accelerators.
  **Whatever M7 lets a thumb do, it must let a mouse do too.**

**The questions the grill must actually resolve** (do not let it end early):
- **Where do stickers live, and in what coordinate space?** They are one *global* layer shown on
  every month (US-9), while stamps are normalized to a 7:6 day cell. What is a sticker's
  coordinate box — the calendar viewport? the month grid? — and what happens to that position
  when the view switches close-up ↔ full-month, when the month changes, or when the window
  resizes? This is the milestone's central decision and everything else hangs off it.
- **Can a sticker be manipulated in both views, or only one?** (Beware: the close-up view is a
  horizontal scroller.)
- **Gestures vs the calendar's own.** The calendar owns pinch-to-switch and a horizontal scroll;
  M6 already had to add a pinch-isolation rule (`src/lib/calendar/pinch.ts`). How does a sticker
  drag/pinch not fight them? Can `DayGestures` be reused/generalized, or is a second machine
  honest? (Reuse is strongly preferred — the clamps and the one-write-per-gesture rule are
  load-bearing.)
- **The tray**: how it opens, how upload works, how the 3–5 **seeded** stickers get there (they
  are `is_seeded` and are **not deletable**), and what happens when the tray is empty.
- **The image path**: stickers are **PNG, transparency preserved** (ALG-1 `kind: 'sticker'`).
  Reuse `src/lib/image/ingest.ts` + `thumb-url.ts` — do not fork a second pipeline.
- **Memory (ALG-6).** A global layer is on screen in *every* month. How many object URLs is
  that, and who releases them? There is an object-URL canary test for a reason.
- **The 3-cap does not apply here** — what bounds a sticker layer instead (if anything)?
- **Deletion**: placed stickers soft-delete + Undo (like stamps); tray assets delete except
  seeded ones.

## Phase 2 — Build

Only after `M7-PLAN.md` exists and its decisions are resolved.

- **Setup:** branch `m7-stickers` off `master`.
- **Build directly, one thread — do NOT use `/parallel-plan`.** The codex worktree agents lost
  git state on M2/M3; M4/M5/M6 were all built directly and it went fine.
- **Package manager is pnpm.** `pnpm lint` and `pnpm build` must pass at the end of **every**
  task; `pnpm test` green by the last one. Commit per task with a conventional message, and
  **no `Co-Authored-By` trailer** (repo convention).
- **Respect the seams** (they are the whole architecture):
  - reads → `src/lib/db/queries.ts`; writes → `src/lib/db/mutations.ts` (`markDirty` only);
    images → `src/lib/image/thumb-url.ts`. **Components never call `db.*` or Supabase directly.**
  - scheduling stays in `src/lib/sync/engine.ts`; blobs never enter a synced table.
  - **every object URL is released** (ALG-6 — the freeze fix).
  - **write once per gesture, on gesture-end** — never per animation frame.
  - tunable numbers live in ONE constants object per module (see `PLACEMENT` in
    `src/lib/day/place.ts`); tests assert invariants, not the constants.
- **Dexie:** the schema is at **v4**. If M7 needs a bump it takes **v5** — coordinate at merge,
  because M8 is being built in parallel on its own branch.
- **Postgres:** `sticker_assets` and `placed_stickers` already exist and M7 is their first
  writer — so if you need to change them, a plain `alter table` is safe (no rows anywhere yet).
  **Migrations are NOT auto-applied to hosted Supabase**: write the migration, then tell the
  owner to run `supabase db push` (that is an owner step, not yours).

**Verification is two-tier, as it was for M3/M5/M6:**
- **Tier 1 (yours):** the vitest battery from the plan's Definition of done, plus an
  **object-URL canary** and a **gesture-isolation test** (a sticker gesture must not switch the
  calendar view or scroll the month). Confirm **no regression** to the M2/M3/M4/M5/M6 suites
  (166 tests green on master today).
- **Tier 2 (owner-run):** a real-phone gate. Build a `/dev/stickers` harness so the owner can
  run it; **do not block on it yourself.** Note the dev routes sit behind the auth proxy, so you
  cannot drive them without a session — but you *can* drive an unauthenticated bench page in the
  browser if you need to see something render (that is how M6's mask geometry got fixed).

**Merge coordination (M8 is running in parallel):** M7 and M8 will both touch
`src/components/calendar/Calendar.tsx` and `CalendarMenu.tsx`. Keep your edits to those files
minimal and additive, and expect a small conflict at merge.

When it is green, stop and report; the owner merges `m7-stickers` → `master`, pushes any
migration, and runs the Tier-2 gate.
