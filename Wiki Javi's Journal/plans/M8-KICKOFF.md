# M8 kickoff prompt — Pokémon frames (US-10)

*(Paste everything below the line into a fresh session. It covers BOTH phases: design, then
build — the same process M2…M6 used.)*

---

Work **M8 — Pokémon frame switching (US-10)** for Javi's Journal, from design through to a
merged branch.

## Phase 1 — Design (do this first, before any code)

Run **`/grill-me`** against the M8 slice of the planning docs and resolve every open decision
before writing a line of code. The output is **`Wiki Javi's Journal/plans/M8-PLAN.md`** — a task
DAG, the resolved decisions with their rationale, and a two-tier Definition of done — written in
the same shape as `M6-PLAN.md`. Read `M6-PLAN.md` first to see the bar.

**Read before grilling:**
1. `AGENTS.md` / `CLAUDE.md` — the project guide. **This is Next.js v16.x, not the one you
   know**: read `node_modules/next/dist/docs/` before touching `src/app/**`.
2. `Wiki Javi's Journal/PLAN.md` (US-10, the frame list, the milestone DAG), `DESIGN.md`
   (FLOW-8 — change frame; ALG-7 notes that the M9 PNG export must later rasterize this same
   frame as a manual 9-slice, because CSS `border-image` does not apply to canvas),
   `SCHEMA.md` (`profiles.selected_frame` — the column **already exists**, CHECK-constrained to
   `rse` / `hgss_15` / `hgss_18`, and it already syncs).
3. `src/components/calendar/*` — `Calendar.tsx` (the island: view state, fit model, the pinch
   handler, the day overlay), `CalendarMenu.tsx` (the 3-dots menu the frame picker joins),
   `MonthFull.tsx` / `MonthCloseUp.tsx`, and `src/lib/calendar/fit.ts` (`computeCellW` — the
   fit model a frame's border must not break).
4. `src/lib/db/queries.ts` (`useProfile`) + `mutations.ts` (`setStartOfWeek` — the exact shape
   the frame write should copy).

**The source art:** `C:\Users\olgui\Downloads\calendar frame inspo\` — `Frame_11_RSE.png`,
`Frame_15_HGSS.png`, `Frame_18_HGSS.png`. They are **inspiration/reference**, to be recreated as
clean 9-slice `border-image` assets in `public/frames/` (the directory exists and is empty).
Look at them before you design anything.

**Good news, and it should shape the plan:** the data layer for M8 is **already done**.
`profiles.selected_frame` exists in Postgres, in `src/lib/db/types.ts`, and in the sync engine's
LWW tables. There is very likely **no migration and no Dexie bump** — M8 is a *rendering +
asset* milestone, not a schema one. If the grill concludes otherwise, say so explicitly.

**The questions the grill must actually resolve** (do not let it end early):
- **What exactly does the frame frame?** The month grid only? The whole viewport? Does it show
  in *both* views (full-month and the close-up horizontal scroller — where the content scrolls
  under it), and does it show behind the day-page overlay?
- **`border-image` vs a positioned overlay vs a padded container.** `border-image` is what the
  docs commit to, but it eats layout box — so how does it interact with `computeCellW`'s fit
  model, which currently assumes the grid gets the whole available box? A frame that shrinks the
  grid on a phone is a real risk to "never fights her".
- **The asset spec, pinned as a constant object**: source size, the 9-slice `border-image-slice`
  insets, `border-image-width`, `repeat` vs `round` vs `stretch`, and `image-rendering:
  pixelated` for pixel art. **Pin the slice insets per frame, measured off the asset** — M6's
  lesson (see `PUNCH_WINDOW`) is that one measured, unit-tested constant object beats numbers
  scattered through a component.
- **File size + format.** These are the app's most-seen chrome, on every month view. M6 got a
  1.5 MB PNG down to a 50 KB WebP; hold the frames to a similar bar and say what the budget is.
- **Phone vs desktop.** US-10 says it must "read well on phone + desktop" — a pixel-art border
  that looks charming at 900px can be mud at 380px. What is the fallback: a thinner slice, a
  different `border-image-width`, or no frame below a breakpoint?
- **The picker UI**: a 3-dots item ("Change frame") opening what — a sheet with 3 previews? What
  does a preview look like, and is the change optimistic (it must be: write via `markDirty`,
  same as `setStartOfWeek`)?
- **M9's debt.** The PNG export will have to rasterize this frame manually (canvas has no
  `border-image`). Leave M9 a clean seam — ideally the slice geometry lives in a pure module
  M9 can import — and note it in the plan.

## Phase 2 — Build

Only after `M8-PLAN.md` exists and its decisions are resolved.

- **Setup:** branch `m8-frames` off `master`.
- **Build directly, one thread — do NOT use `/parallel-plan`.** The codex worktree agents lost
  git state on M2/M3; M4/M5/M6 were all built directly and it went fine.
- **Package manager is pnpm.** `pnpm lint` and `pnpm build` must pass at the end of **every**
  task; `pnpm test` green by the last one. Commit per task with a conventional message, and
  **no `Co-Authored-By` trailer** (repo convention).
- **Respect the seams:** reads → `src/lib/db/queries.ts`; writes → `src/lib/db/mutations.ts`
  (`markDirty` only — copy `setStartOfWeek`); scheduling stays in `src/lib/sync/engine.ts`.
  **Components never call `db.*` or Supabase directly.** Styling is **Tailwind v4** with the
  CSS-first `@theme` token layer in `src/app/globals.css` (no `tailwind.config.js`); frames must
  work under the shipped `pastel` theme.
- **Dexie** is at v4 and M8 probably needs no bump. If it does, **coordinate at merge** — M7 is
  being built in parallel on its own branch and would take v5.
- If you do end up writing a migration: **it is NOT auto-applied to hosted Supabase.** Write it
  and tell the owner to run `supabase db push` (an owner step).

**Verification is two-tier, as it was for M3/M5/M6:**
- **Tier 1 (yours):** vitest over the pure layer — the slice-geometry constants (each frame's
  insets are self-consistent and inside the asset), and the fit model still producing a
  non-scrolling 7×6 grid at phone, tablet and desktop sizes **with the frame applied**. Confirm
  **no regression** to the M2/M3/M4/M5/M6 suites (166 tests green on master today).
  You **can and should** render the frames in a real browser to check them — the dev server runs
  locally, and an unauthenticated bench page renders without a session (that is how M6's mask
  geometry got fixed). A frame is a visual object; do not ship it having never looked at it.
- **Tier 2 (owner-run):** a real-phone gate (all 3 frames, both views, persists across reload,
  matches on a second device). Build a `/dev/frames` harness so the owner can run it; **do not
  block on it yourself.**

**Merge coordination (M7 is running in parallel):** M7 and M8 will both touch
`src/components/calendar/Calendar.tsx` and `CalendarMenu.tsx`. Keep your edits to those files
minimal and additive, and expect a small conflict at merge.

When it is green, stop and report; the owner merges `m8-frames` → `master` and runs the Tier-2
gate.
