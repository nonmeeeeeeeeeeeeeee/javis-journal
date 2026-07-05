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
Scaffolded skeleton only — **no feature code has been written yet.** Development starts from
the milestone roadmap in `Wiki Javi's Journal/PLAN.md`.

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
- **Styling**: plain CSS Modules (soft cozy pastel aesthetic).

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
- `public/frames/` — Pokémon `border-image` frame assets. `public/stickers/` — seeded stickers.

## Environment
Copy `.env.local.example` → `.env.local` and fill in the Supabase project keys and
`OWNER_OVERRIDE_EMAIL`. Never commit `.env.local`.

## Commands
- `npm run dev` — start the dev server (http://localhost:3000).
- `npm run build` / `npm run start` — production build / serve.
- `npm run lint` — ESLint.

## Guardrails
- This is a personal gift locked to Javi's Google account — keep sign-up disabled behind the
  allowlist, with the owner-override recovery path.
- Never load full-res images in the month/day grid — thumbnails only; virtualize history and
  revoke object URLs (the fix for the ~20-day freeze). See DESIGN ALG-6.
- Keep the editor reliable above all; decorative flourishes (cut animation, fireworks) are
  last-mile and must degrade gracefully.
