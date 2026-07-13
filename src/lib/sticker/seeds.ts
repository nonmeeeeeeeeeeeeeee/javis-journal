// The seeded stickers: the 3 that are already in her tray on day one (US-9). They are part of
// the gift, not her content — the tray hides their delete affordance and the Postgres trigger
// refuses to tombstone them.
//
// A seeded sticker is *just an uploaded sticker she didn't have to upload*: the seeder fetches
// the file and runs it through the SAME M3 pipeline (`ingestImage(file, 'sticker')` — PNG alpha
// preserved), so it uploads, syncs, thumbnails and renders exactly like one of hers. There is no
// second image path.

export type StickerSeed = {
  /** Stable identity — it is what the deterministic ids are hashed from. NEVER renumber these. */
  slug: string;
  /** Under `public/`. 512×512 RGBA PNGs with genuinely transparent corners. */
  path: string;
};

export const STICKER_SEEDS: StickerSeed[] = [
  { slug: "sticker_01", path: "/stickers/sticker_01.png" },
  { slug: "sticker_02", path: "/stickers/sticker_02.png" },
  { slug: "sticker_03", path: "/stickers/sticker_03.png" },
];
