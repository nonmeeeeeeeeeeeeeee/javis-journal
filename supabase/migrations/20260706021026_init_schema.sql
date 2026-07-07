-- Javi's Journal — initial schema
-- Source: Wiki Javi's Journal/SCHEMA.md

create extension if not exists pgcrypto;

create table allowed_emails (
  email    text primary key,
  note     text,
  added_at timestamptz not null default now()
);

create table profiles (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  start_of_week  smallint not null default 1 check (start_of_week between 1 and 7),
  selected_frame text not null default 'rse'
                   check (selected_frame in ('rse','hgss_15','hgss_18')),
  fireworks_seen boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table images (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  storage_path text not null unique,
  thumb_path   text not null,
  width int, height int,
  mime         text not null default 'image/jpeg',
  byte_size    int,
  created_at   timestamptz not null default now()
);
create index images_user_idx on images(user_id);

create table entries (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  entry_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, entry_date)
);

create table stamps (
  id            uuid primary key default gen_random_uuid(),
  entry_id      uuid not null references entries(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  image_id      uuid not null references images(id) on delete restrict,
  mask_type     text not null default 'postage'
                  check (mask_type in ('postage','cloud','spiky','heart','circle','square','oval')),
  crop_offset_x real not null default 0,
  crop_offset_y real not null default 0,
  crop_scale    real not null default 1 check (crop_scale > 0),
  pos_x         real not null default 0.5,
  pos_y         real not null default 0.5,
  scale         real not null default 1 check (scale > 0),
  rotation_deg  smallint not null default 0
                  check (rotation_deg in (0,45,90,135,180,225,270,315)),
  layer_order   int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create index stamps_entry_live_idx on stamps(entry_id) where deleted_at is null;
create index stamps_sync_idx       on stamps(user_id, updated_at);

create table sticker_assets (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  image_id   uuid not null references images(id) on delete restrict,
  is_seeded  boolean not null default false,
  created_at timestamptz not null default now()
);
create index sticker_assets_user_idx on sticker_assets(user_id);

create table placed_stickers (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  image_id         uuid not null references images(id) on delete restrict,
  sticker_asset_id uuid references sticker_assets(id) on delete set null,
  pos_x        real not null default 0,
  pos_y        real not null default 0,
  scale        real not null default 1 check (scale > 0),
  rotation_deg smallint not null default 0
                 check (rotation_deg in (0,45,90,135,180,225,270,315)),
  layer_order  int not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);
create index placed_stickers_sync_idx on placed_stickers(user_id, updated_at);

-- Cap: at most 3 stamps per calendar day
create or replace function enforce_stamp_cap() returns trigger as $$
begin
  if (select count(*) from stamps
        where entry_id = new.entry_id and deleted_at is null) >= 3 then
    raise exception 'A day can have at most 3 stamps';
  end if;
  return new;
end;
$$ language plpgsql;

create trigger stamps_cap_trg
  before insert on stamps
  for each row execute function enforce_stamp_cap();

-- Row-Level Security: every user-owned table restricted to auth.uid() = user_id.
-- allowed_emails has RLS enabled with no policies — it's only read server-side
-- via the service role, which bypasses RLS.

alter table allowed_emails   enable row level security;
alter table profiles         enable row level security;
alter table images           enable row level security;
alter table entries          enable row level security;
alter table stamps           enable row level security;
alter table sticker_assets   enable row level security;
alter table placed_stickers  enable row level security;

create policy profiles_owner on profiles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy images_owner on images
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy entries_owner on entries
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy stamps_owner on stamps
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy sticker_assets_owner on sticker_assets
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy placed_stickers_owner on placed_stickers
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
