<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Javi's Journal — project guide

A personal, phone-first, fully-responsive scrapbook-journal web app — a birthday gift for
Javi. Local-first canvas journaling: each calendar day is a decorable page where photos are
placed as resizable **stamps** (cut behind a shape mask) alongside custom **stickers**, on a
customizable **calendar** with a full-month progress view.

North star: **"the journal that never fights her."** Priorities: a superb stamp cutter, a
silent instant save/sync, and no long-run freeze — polish over feature count.

> The full planning docs live in `Wiki Javi's Journal/`: IDEA, PLAN (user stories US-1…US-14
> + milestone DAG), SCHEMA (Postgres/Supabase), and DESIGN (interactions, API surface,
> algorithms ALG-1…ALG-9). Read those before implementing a story.

## Status
Milestone roadmap and DAG live in `Wiki Javi's Journal/PLAN.md`; each milestone's resolved
execution plan lands in `Wiki Javi's Journal/plans/M{N}-PLAN.md` (see Methodology below).

- [x] **M1 — Foundation + auth** (US-1) — schema, RLS, private storage bucket, Supabase
      clients, allowlist gate, session proxy, login/denied pages, health cron all done and
      committed. **One manual step left:** repairing the Google OAuth redirect URI in the
      Google/Supabase console.
- [ ] M2 — Local-first + sync (US-11, sync half of US-13)
- [ ] M3 — Image pipeline (compression half of US-13)
- [ ] M4 — Calendar views (US-2, US-3, US-4, US-5)
- [ ] M5 — Stamper / cutter (US-6)
- [ ] M6 — Day editor (US-7, US-8)
- [ ] M7 — Stickers + tray (US-9)
- [ ] M8 — Pokémon frames (US-10)
- [ ] M9 — PNG export (US-12)
- [ ] M10 — Stability gate + polish + ship (US-13 hard gate, US-14)

## Stack
- **Next.js (App Router) + React + TypeScript**, deployed on Vercel.
- **Supabase** — Auth (Google OAuth + email allowlist + `OWNER_OVERRIDE_EMAIL`), Postgres
  (RLS `auth.uid() = user_id`), Storage (private bucket + signed URLs).
- **Local-first**: IndexedDB via **Dexie** (entries, stamps, placed_stickers, images incl.
  uncompressed originals, sticker_assets, profiles, sync cursors).
- **Sync engine**: debounced push/pull to Supabase, **last-write-wins per element** via a
  client-authored `updated_at`; `deleted_at` tombstones propagate deletes.
- **Image pipeline**: client-side HEIC decode (`heic2any`), EXIF fix, downscale ~2048px
  (q0.8) + 256px thumbnail; only compressed + thumb upload, originals stay on-device.
- **Cutter**: canvas-based masking (`destination-in`), crop stored in normalized source-pixel
  space (never CSS `clip-path`, never a baked cutout).
- **Styling**: **Tailwind CSS v4** (CSS-first `@theme` token layer in `src/app/globals.css`;
  PostCSS plugin, no `tailwind.config.js`). Semantic design tokens (`--color-paper/ink/
  accent/today`, `--font-title/body`, `--radius-*`) drive utilities (`bg-paper`, `text-ink`,
  `font-title`, …). **Swappable `data-theme`** aesthetics: `pastel` ships (set on `<html>`);
  `paper` + `scrapbook` are dev-time comparison themes (override the same token vars). No OS
  dark mode — the chosen aesthetic is committed. CSS Modules may still be used for complex
  canvas/cutter styling where utilities fall short. Tune the look live at `/preview`
  (dev-only, fit-to-screen month calendar + theme switcher).

## Layout
- `src/app/` — routes (App Router). API routes: `api/auth/gate` (allowlist sign-in gate),
  `api/health` (cron warm-ping).
- `src/components/` — UI screens (calendar close-up, full-month, day page, stamper, sticker
  picker, 3-dots menu).
- `src/lib/db/` — Dexie schema + local-first store.
- `src/lib/sync/` — debounced sync engine (ALG-3/ALG-4, LWW + tombstones).
- `src/lib/image/` — image pipeline + stamp cutter (ALG-1/ALG-2).
- `src/lib/supabase/` — browser + server Supabase clients (`@supabase/ssr`).
- `src/lib/auth/` — allowlist gate helpers + owner-override.
- `src/proxy.ts` — session-refresh + login/home redirect proxy (this Next.js version
  renamed `middleware.ts` → `proxy.ts`; see the banner at the top of this file).
- `public/frames/` — Pokémon `border-image` frame assets. `public/stickers/` — seeded stickers.

## Environment
Copy `.env.local.example` → `.env.local` and fill in the Supabase project keys and
`OWNER_OVERRIDE_EMAIL`. Never commit `.env.local`.

## Commands
- **Package manager: pnpm** (pinned via `packageManager` in `package.json`). Don't
  reintroduce `package-lock.json`.
- `pnpm dev` — start the dev server (http://localhost:3000).
- `pnpm build` / `pnpm start` — production build / serve.
- `pnpm lint` — ESLint.

## Methodology
Each milestone (M2…M10) is worked in two phases:

1. **Design** — run `/grill-me` against the milestone's slice of `PLAN.md` / `DESIGN.md`
   to resolve every open decision (data shapes, edge cases, ordering, naming) before any
   code is written. The output is `M{N}-PLAN.md`, saved to `Wiki Javi's Journal/plans/`,
   with a task DAG and a definition of done.
2. **Build** — execute the plan:
   - If the DAG has genuinely independent leaf tasks (e.g. a DB migration alongside
     application code), use `/parallel-plan` to run them concurrently as `codex:rescue`
     agents in isolated git worktrees.
   - Otherwise — a single thread of work, or tasks with real interdependencies — build
     directly in the main worktree; don't pay for agent isolation that isn't needed.
   - `pnpm lint` and `pnpm build` must pass before a task counts as done.
   - Commit per task with a conventional `feat:`/`chore:`/`fix:` message, not one giant
     milestone commit.

M1 was built this way. Two of its three parallel-plan tasks lost git state mid-run and
needed manual recovery onto `master` (see `.claude/dag-state.json`) — a known failure mode
of the worktree/agent flow to watch for, not a reason to avoid parallelizing genuinely
independent work.

## Guardrails
- This is a personal gift locked to Javi's Google account — keep sign-up disabled behind the
  allowlist, with the owner-override recovery path.
- Never load full-res images in the month/day grid — thumbnails only; virtualize history and
  revoke object URLs (the fix for the ~20-day freeze). See DESIGN ALG-6.
- Keep the editor reliable above all; decorative flourishes (cut animation, fireworks) are
  last-mile and must degrade gracefully.
