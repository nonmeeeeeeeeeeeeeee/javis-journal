# M8 addendum — "no frame" (US-10)

> A post-M8 increment, not a milestone. M8 shipped three frames and made one of them always
> worn. This makes *unframed* a fourth, first-class choice.

## The ask

Tapping the frame swatch she is already wearing takes the frame off. The calendar can be bare.

## Decisions

### 1. `'none'` is a value in the column, not a null and not a second field

`profiles.selected_frame` stays `not null`; the CHECK constraint widens to include `'none'`:

```sql
alter table profiles drop constraint profiles_selected_frame_check;
alter table profiles add constraint profiles_selected_frame_check
  check (selected_frame in ('rse','hgss_15','hgss_18','none'));
```

A pure widening — every stored value stays valid, nothing to backfill.

Rejected: **nullable column** (`queries.ts:360` already does `row?.selected_frame ?? DEFAULT_FRAME`,
which would silently turn "she chose no frame" back into Ruby — a coalesce that reads correct and
is not); **a separate `frame_enabled` boolean** (two fields for one concept, and the M2 LWW merge
could interleave them across devices into a state neither device chose).

⚠ **The owner must run `supabase db push`.** Migrations are not auto-applied to hosted Supabase.

### 2. The type splits: `FrameId` (the three real frames) vs `SelectedFrame` (what the DB holds)

```ts
// src/lib/db/types.ts
export type FrameId = "rse" | "hgss_15" | "hgss_18";
export type SelectedFrame = FrameId | "none";
```

`FRAMES` stays a `Record<FrameId, FrameSpec>`. This is the point of the split: any code that
indexes `FRAMES[frame]` without first narrowing away `'none'` **fails to compile**, so the
compiler — not a reviewer — enforces that every consumer handles the bare case.

The three frame-layer functions take the wide union and early-return the identity:

- `frameCss('none', s)` → `{}`
- `frameInsets('none', s)` / `frameBoxInsets('none', s)` → `{ w: 0, h: 0 }`

`FRAME_IDS` narrows to `FrameId[]` (`spec.test`, `fit.test`, `nine-slice.test` iterate it and
stay on real frames only — no test changes needed there).

### 3. `FramedGrid` always mounts; `'none'` means no ring, not no box

`FramedGrid` owns `data-month-frame` — **M9's export target**, the rectangle the PNG export
rasterizes, and the one rect identical in full-month, in the close-up scroller, and in the export.
With `'none'` it renders with no border and `padding: 0`, but it is still in the tree, still
carries the attribute, still wraps the weekday header + 7×6 grid.

Rejected: conditionally rendering the wrapper. It would let the export target *vanish*, forcing
M9 to grow a fallback path for an unmarked rectangle — throwing away the exact invariant M8 was
built to establish.

### 4. Layout is a no-op on a phone

`fit.ts` already types `frameW`/`frameH` as optional with `0 = no frame`. Under M8's per-edge
charging rule, left/right/bottom overhang into the `GUTTER` (free) and only the top ink is paid
for — so on a width-bound viewport (phone portrait) **`cellW` is bit-identical framed and
unframed**. Height-bound viewports (desktop/landscape) get the ~14px top ink back and cells grow
slightly. Nothing else moves.

### 5. No Dexie bump — the schema stays **v5**

`selected_frame` is an unindexed value column. Widening its *domain* changes no Dexie index and
no store. A v6 for this would be cargo-cult and would cost a real upgrade path on her device for
nothing. (Same reasoning M8 itself used to stay on M7's v5.)

### 6. `DEFAULT_FRAME` stays `'rse'`; `'none'` is never a default

The `?? DEFAULT_FRAME` at `queries.ts:360` fires when there is **no profile row yet** (first boot,
pre-sync) — which is not the same thing as "she chose no frame". A fresh journal opens wearing
Ruby, as today; only an explicit tap writes `'none'`, and once the row exists `'none'` flows
through the `??` untouched. **That line needs no change.** The column's Postgres `default 'rse'`
also stays, as does the `selected_frame: "rse"` synthesized row in `setStartOfWeek`
(`mutations.ts:48`).

### 7. The menu: a fourth "None" swatch **and** the re-tap toggle

The radiogroup in `CalendarMenu.tsx` grows a fourth member so `'none'` has a visible, tappable
identity (the re-tap gesture alone is undiscoverable, and a radiogroup with nothing checked is a
dishonest a11y shape). It wears its real absence: a paper square with a **dashed** 1px `border-line`
outline — dashed reads as "nothing here", where a solid hairline would read as "a thin frame".

Sizing: the row is `flex justify-between gap-2` inside a `w-56` (224px) menu with `px-4` → 192px of
content. Four `size-11` (44px) swatches + 3×8px gaps = 200px, ~8px over; **swatches drop to
`size-10` (40px)** (4×40 + 24 = 184px, fits). The button's `p-1` keeps the touch target adequate.

And the gesture as asked: **tapping the frame she is currently wearing sets `'none'`.**

### 8. Re-tapping a selected `None` is a no-op

Not a symmetric toggle. Restoring "the last real frame" would need a `lastFrame` that isn't in the
DB, doesn't sync, and behaves differently on her phone than her laptop. `'none'` is a state you
leave by tapping a frame — always one tap, nothing is trapped.

`setSelectedFrame` **early-returns when the value is unchanged** (before `db.profiles.put` /
`markDirty`), so a double-tap on any swatch never spams the sync outbox. This makes the `None`
re-tap free automatically.

## Tasks

1. **Migration** — `supabase/migrations/<ts>_frame_none.sql` (the CHECK swap above). Update
   `SCHEMA.md:123` + `SCHEMA.md:312-313`. Owner runs `supabase db push`.
2. **Types** — `types.ts`: add `FrameId`, widen `SelectedFrame`. `spec.ts`: `FrameSpec.id: FrameId`,
   `FRAMES: Record<FrameId, FrameSpec>`, `FRAME_IDS: FrameId[]`, `'none'` early-returns in
   `frameInsets`/`frameBoxInsets`. `style.ts`: `'none'` → `{}`.
3. **`FramedGrid`** — no border / `padding: 0` under `'none'`; attribute and box unchanged.
4. **`mutations.ts`** — `setSelectedFrame` early-return on unchanged value.
5. **`CalendarMenu`** — fourth "None" swatch (dashed, `size-10`), `size-10` across the row, and the
   re-tap-to-remove rule in `onSetFrame`.
6. **Dev harness** — `/dev/frames`: add `'none'` to the selector so the bare box is inspectable.

## Definition of done

- `pnpm lint` + `pnpm build` pass.
- New tests: `frameCss('none')` is empty and `frameBoxInsets('none', s)` is `{0,0}`; `computeCellW`
  with `frameW/frameH = 0` equals the unframed baseline **and** equals the framed value on a
  390px-wide phone (the "never fights her" assertion); `setSelectedFrame` is a no-op (no
  `sync_outbox` row) when the value is unchanged; re-tapping the worn frame writes `'none'`.
- Existing 227 tests still green — no changes expected to `spec.test` / `fit.test` /
  `nine-slice.test`, which iterate `FRAME_IDS`.
- Tier-2 owner gate on a real phone: toggle the frame off, confirm the grid does not reflow, confirm
  it survives a reload (local) and lands on the second device (sync).
