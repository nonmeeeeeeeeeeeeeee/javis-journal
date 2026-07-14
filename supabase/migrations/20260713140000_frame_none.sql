-- "No frame" as a first-class fourth choice (M8 addendum, US-10).
--
-- A pure widening of the CHECK domain: the column stays `not null` and keeps its `'rse'` default,
-- every already-stored value stays valid, and there is nothing to backfill. `'none'` is a value
-- she chooses, never a default — a fresh profile still opens wearing Ruby.
--
-- The alternative (a nullable column) was rejected: the client reads
-- `row?.selected_frame ?? DEFAULT_FRAME`, where the `??` means "no profile row yet", so a null
-- would silently turn "no frame" back into Ruby.

alter table profiles drop constraint profiles_selected_frame_check;

alter table profiles add constraint profiles_selected_frame_check
  check (selected_frame in ('rse', 'hgss_15', 'hgss_18', 'none'));
