# Wiki — Javi's Journal

Snapshot of the planning docs for **Javi's Journal**, copied from the ideas workspace
(`C:\Users\olgui\Projects\ideas\javis-journal`) on **2026-07-05** when the project was
scaffolded.

These are point-in-time copies for convenience while building. The living originals stay in
the ideas workspace.

## Documents
- [IDEA.md](IDEA.md) — the concept, target user (Javi), scope, and constraints.
- [PLAN.md](PLAN.md) — user stories, UI screens & flow, milestone DAG, tech stack decision log.
- [SCHEMA.md](SCHEMA.md) — Postgres schema (Supabase): tables, ER diagram, indexes, DDL.
- [DESIGN.md](DESIGN.md) — intra-app interactions, backend API surface, and the key algorithms.

## Stack (from PLAN.md)
Next.js (App Router) + React + TypeScript on Vercel · Supabase (Auth / Postgres / Storage) ·
local-first IndexedDB (Dexie) + debounced last-write-wins sync · client-side image pipeline
(HEIC decode, EXIF fix, ~2048px downscale + 256px thumb) · canvas-based stamp cutter.
