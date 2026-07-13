# M4 build kickoff prompt (paste into a fresh session)

---

Build **M4 — Calendar views (US-2, US-3, US-4, US-5)** for Javi's Journal. The design is
fully resolved.

**Read first, in order:**
1. `AGENTS.md` / `CLAUDE.md` (project guide — note: this is Next.js **v16.x**, NOT the one you
   know; read the relevant guide under `node_modules/next/dist/docs/` before touching
   `src/app/**`. The session proxy is `src/proxy.ts`, renamed from `middleware.ts`).
2. `Wiki Javi's Journal/plans/M4-PLAN.md` — **the plan you are executing. Follow it.** Its
   "Resolved design decisions," component/file layout, Task DAG (T1–T9), and Definition of
   done are authoritative.
3. Skim what you consume, don't rebuild:
   - **M3 display helper** `src/lib/image/thumb-url.ts` — `getThumbUrls(ids)` batch-signs a
     whole month in one round-trip and returns releasable `ThumbHandle`s. The grid uses this;
     never load full-res.
   - **M2 store + sync** `src/lib/db/index.ts`, `src/lib/db/types.ts`, `src/lib/sync/outbox.ts`
     (`markDirty`), `src/lib/sync/pull.ts` (how `profiles` is read/written).
   - **The visual source of truth** — the `/preview` routes and `src/app/preview/_shared.tsx`.
     M4 productionizes `/preview/interactive` (both views + pinch + fit model). Port that fit +
     gesture model **as-is**; rebuild `_shared.tsx`'s primitives as real components.

**Critical context you must hold:**
- **Reads go through a new `src/lib/db/queries.ts` seam only** (add `dexie-react-hooks`);
  components never call `db.*` directly. Week-start writes go through `markDirty`, never a
  direct Supabase call.
- **Never load full-res in the grid** — 256px thumbs via `getThumbUrls`, batched once per
  month, and **`release()` every `ThumbHandle` on month unmount** (ALG-6, the freeze fix).
- **Month navigation is fully discrete → exactly one month is mounted at a time.** ALG-6's
  "±1 month carousel" wording is superseded (T9 fixes the docs). The object-URL canary in the
  `/dev/calendar` harness is the guard — build it and keep the count flat.
- **Day cell = single top-`layer_order` stamp thumb, `object-fit: cover`.** No mask / no
  multi-stamp composition — that is M5. Keep `DayCell` thumb-selection isolated so M5 can swap
  the source later.
- **Day-tap navigation, the day page, stamps, sticker tray/layer, frames, PNG export are OUT
  of scope** (M5/M6/M7/M8/M9). Sticker button is **visible but inert** (SVG line icon, not the
  emoji); no `placed_stickers` rendered.
- **Dropped the "Today" button** (deviation from US-3, documented). Week-start exposes **Mon/Sun
  only** in the 3-dots menu. Month picker is bounded **`[2026-07, current month]`**, no future.

**Setup — new branch:** create a fresh branch **`m4-calendar` off the current `ui-design`
tip** and build there. (M5 builds simultaneously on a separate `m5-stamper` worktree — don't
touch its surface. The only likely shared files are `src/lib/db/index.ts` and
`src/lib/db/types.ts`.)
- **Dexie version collision:** M4 adds a **v3 migration** (`entries: "id, entry_date"`). If a
  merge shows M5 also defining `version(3)`, **renumber** (one takes v3, the other v4) — the
  migrations are additive and independent. M4 does not modify `types.ts`.

**How to build:** directly, one thread, in DAG order **T1 → T2 → T3 → T4 → T5 → T6 → T7 → T8 →
T9**. **Do NOT use `/parallel-plan`** — the codex worktree agents have failed on this Windows
machine every milestone (they fight node_modules junction/ACL and commit nothing). Verify each
task yourself.

**Per-task rules:**
- Package manager is **pnpm** (no npm/yarn, no `package-lock.json`).
- `pnpm lint` and `pnpm build` must pass at the end of **every** task; `pnpm test` must pass by
  the end of **T8**.
- Styling is **Tailwind v4 CSS-first tokens** (`src/app/globals.css`), `data-theme="pastel"`.
  Reuse semantic tokens (`bg-paper`, `text-ink`, `border-line`, `bg-today-bg`/`text-today-ink`,
  `font-title`, `rounded-*`). No CSS Modules needed.
- **Commit per task** with a conventional `feat:`/`chore:`/`fix:` message. **No `Co-Authored-By`
  trailer** (repo convention). Not one giant milestone commit.
- Keep `/preview*` exactly as-is (dev sandbox); build real components under
  `src/components/calendar/` and pure logic under `src/lib/calendar/`.

**Definition of done:** the Tier-1 (automated) + Tier-2 (harness/real-device) checklists and
US-2…US-5 acceptance in `M4-PLAN.md`. In particular: grid loads only `getThumbUrls` thumbs,
object-URL count stays flat across many month navigations, opens on the current month centered
on today, discrete month nav bounded to `[2026-07, current]`, week-start Mon/Sun re-lays-out +
persists + syncs, pinch (touch) + menu toggle (all devices) switch views, responsive on iPhone
13 Pro Max + desktop.

Start by reading the three docs above, then create the `m4-calendar` branch and begin **T1**.
