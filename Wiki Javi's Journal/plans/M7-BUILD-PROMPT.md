# M7 — Build prompt (paste this into a fresh session)

Build **M7 — Stickers + tray (US-9)** for Javi's Journal. The design phase is **done**: every
decision is already resolved in **`Wiki Javi's Journal/plans/M7-PLAN.md`**, which is the **ADR of
record**. Do not re-litigate it — execute it.

## Read first (in this order)
1. **`Wiki Javi's Journal/plans/M7-PLAN.md`** — the whole plan: 18 resolved decisions, 7 tasks,
   the DAG, and a two-tier Definition of done. This is your spec.
2. `AGENTS.md` / `CLAUDE.md` — the project guide. **This is Next.js v16.x, not the one you know**:
   read `node_modules/next/dist/docs/` before touching `src/app/**`.
3. `Wiki Javi's Journal/plans/M6-PLAN.md` — M7 inherits M6's interaction model *and reuses its
   code*. M6 reversed what `DESIGN.md` says (the long-press **menu** is dead; editing is direct
   manipulation). US-9's acceptance criteria still say "long-press menu" — **that wording is
   stale.**
4. The seams you must reuse, not fork: `src/lib/db/queries.ts` (reads), `src/lib/db/mutations.ts`
   (writes, `markDirty` only), `src/lib/image/thumb-url.ts` (images), `src/lib/day/gestures.ts`
   (the machine you are about to extract), `src/lib/day/place.ts` (the `PLACEMENT` constants
   pattern to mirror).

## The headline, so you don't miss it
**M7-PLAN reverses US-9: stickers are MONTH-BOUNDED, not global.** A sticker placed on July 2026
appears only on July 2026. The **tray stays global**. `placed_stickers` gains `year_month`. Task 0
carries this reversal into `PLAN.md` / `DESIGN.md` / `SCHEMA.md`.

## Setup
- Branch **`m7-stickers`** off `master`.
- **Build directly, one thread — do NOT use `/parallel-plan`.** (The codex worktree agents lost
  git state on M2/M3; M4/M5/M6 were built directly and it went fine.)
- Package manager is **pnpm**. `pnpm lint` and `pnpm build` must pass at the end of **every**
  task; `pnpm test` green by the last one.
- Commit per task, conventional message, **no `Co-Authored-By` trailer** (repo convention).

## Execute the DAG in M7-PLAN
```
Task 0 (docs + migration + Dexie v5) ── do first
Task 1 (extract gesture machine + bar) ─┐
Task 2 (sticker pure layer) ────────────┼─► Task 5 (layer + tray + wiring) ─► Task 6 (tests + harness + Tier-2)
Task 3 (db seams + sync) ─┬─────────────┘
                          └─► Task 4 (seeding) ──────────────────────────────┘
```

**The one place to stop and think** is Task 1. You are extracting M6's shipped `DayGestures` into
a surface-parameterized `TransformGestures` so the day page and the sticker layer share one state
machine. It must be **mechanical — no behavior change**. The acceptance test is that **M6's 158
existing tests pass untouched**. If they don't, the refactor changed behavior: **stop, and fork a
second machine instead** (M7-PLAN decision 4 authorizes exactly that fallback).

## Non-negotiables (they are the architecture)
- Components never call `db.*` or Supabase directly. Scheduling stays in `src/lib/sync/engine.ts`.
  Blobs never enter a synced table.
- **Every object URL is released** (ALG-6 — the freeze fix). The canary test exists for a reason.
- **One write per gesture, on gesture-end** — never per animation frame.
- Tunable numbers live in **one constants object per module** (`STICKER`, mirroring `PLACEMENT`).
  Tests assert **invariants**, not the constants.
- **Gesture isolation** (four cases, all in the Definition of done): a selected sticker's pinch
  must not switch the calendar view; its drag must not scroll the close-up month; a wheel over it
  must not scroll the scroller; and an **unselected** sticker must not block a tap from opening
  the day underneath it.
- The stickers are **PNG with transparency**, ingested via `ingestImage(file, 'sticker')`. Do not
  fork a second image pipeline.

## Merge coordination (M8 is running in parallel)
M7 and M8 both touch `src/components/calendar/Calendar.tsx` and `CalendarMenu.tsx`. Keep your
edits to those two files **minimal and additive**; expect a small conflict at merge. **M7 takes
Dexie v5**; M8 needs no Dexie bump, so there is no renumber fight.

## Owner steps — not yours
- **`supabase db push`** (migrations are *not* auto-applied to hosted Supabase — an un-pushed
  migration surfaces as a 400 that looks like an auth bug).
- The **Tier-2 real-phone gate**, including the deliberately-open **sticker sharpness** knob
  (M7-PLAN decision 15: if 256px thumbs look mushy at `MAX_SCALE`, the fix is a one-line switch to
  `getCloseupUrls`). Build the `/dev/stickers` harness so the owner can run it — **do not block on
  it yourself.** The dev routes sit behind the auth proxy, so you cannot drive them without a
  session.

When Tier-1 is green (and the M2–M6 suites — **166 tests on master today** — show no regression),
**stop and report.** The owner merges `m7-stickers` → `master`, pushes the migration, and runs the
Tier-2 gate.
