-- M7 — Stickers + tray (US-9). See `Wiki Javi's Journal/plans/M7-PLAN.md` (the ADR of record).
--
-- Three changes, all safe as plain `alter table`: M7 is the FIRST writer of both tables, so no
-- rows exist yet (which is exactly why a `not null` column with no default is legal here).
--
--   1. placed_stickers.year_month — the headline reversal: stickers are MONTH-BOUNDED, not a
--      global layer floating across every month (M7-PLAN decision 2). The tray stays global.
--   2. sticker_assets becomes a normal LWW table (decision 7): it was half-wired — pull-only,
--      no push path at all — so a tray sticker created on her phone would never reach the
--      server. `updated_at` + `deleted_at` put it on the same footing as every other table.
--   3. A seeded tray asset cannot be tombstoned (decision 8) — enforced in the DATABASE, not
--      just by hiding the affordance, the same posture as enforce_stamp_cap.

alter table placed_stickers
  add column year_month text not null
    check (year_month ~ '^\d{4}-\d{2}$');

create index placed_stickers_month_idx
  on placed_stickers(user_id, year_month)
  where deleted_at is null;

alter table sticker_assets
  add column updated_at timestamptz not null default now(),
  add column deleted_at timestamptz;

create index sticker_assets_sync_idx on sticker_assets(user_id, updated_at);

-- The 3 seeded stickers are part of the gift, not her content: the UI hides the delete
-- affordance, and this makes it impossible.
create or replace function reject_seeded_sticker_delete() returns trigger as $$
begin
  if old.is_seeded and old.deleted_at is null and new.deleted_at is not null then
    raise exception 'A seeded sticker cannot be deleted';
  end if;
  return new;
end;
$$ language plpgsql;

create trigger sticker_assets_seeded_trg
  before update on sticker_assets
  for each row execute function reject_seeded_sticker_delete();
