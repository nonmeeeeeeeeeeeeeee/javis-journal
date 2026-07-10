export type ImageBlobRow = {
  id: string;
  // Full-quality picked file. Present on the ingesting device; null once evicted
  // (>72h + durable upload), on a device that only pulled the row, or for a baked
  // stamp (its source is transient — ADR-M5, never retained).
  original: Blob | null;
  // ~2048px re-fit source (photo/sticker) or ~2048px baked closeup (stamp). Present on
  // the ingesting device; null on a pull-only device until the closeup is lazily
  // downloaded (the grid only needs the thumb).
  main: Blob | null;
  // 256px thumb. Non-null on the ingesting device; null on a pull-only device that
  // downloaded only the closeup (getCloseupUrl's backfill) before the grid thumb.
  thumb: Blob | null;
  kind: "photo" | "sticker" | "stamp";
  createdAt: number;
};
