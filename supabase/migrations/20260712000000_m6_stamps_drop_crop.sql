-- M6: drop the vestigial crop columns from `stamps`.
--
-- ADR-M5 made the cutter destructive: the crop lives in the baked WebP-alpha pixels, so
-- crop_offset_x / crop_offset_y / crop_scale carry no meaning. M6 is the first writer of
-- `stamps` (no rows exist anywhere yet), so this is a plain, data-free drop.
--
-- `mask_type` is KEPT: it is the only record of which shape she cut, and is plausibly
-- load-bearing for per-mask polish later.

alter table stamps
  drop column crop_offset_x,
  drop column crop_offset_y,
  drop column crop_scale;
