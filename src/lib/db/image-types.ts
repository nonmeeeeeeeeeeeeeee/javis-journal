export type ImageBlobRow = {
  id: string;
  // Full-quality picked file. Present on the ingesting device; null once evicted
  // (>72h + durable upload) or on a device that only pulled the row.
  original: Blob | null;
  // ~2048px re-fit source. Present on the ingesting device; null on a pull-only
  // device until the M5 cutter lazily downloads it (the grid only needs the thumb).
  main: Blob | null;
  thumb: Blob;
  kind: "photo" | "sticker";
  createdAt: number;
};
