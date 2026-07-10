import Dexie, { type Table } from "dexie";

import type {
  Entry,
  ImageRow,
  PlacedSticker,
  Profile,
  Stamp,
  StickerAsset,
} from "./types";
import type { ImageBlobRow } from "./image-types";
import type { SyncMetaRow, SyncOutboxRow } from "./sync-types";

export class JournalDB extends Dexie {
  entries!: Table<Entry, string>;
  stamps!: Table<Stamp, string>;
  placed_stickers!: Table<PlacedSticker, string>;
  profiles!: Table<Profile, string>;
  images!: Table<ImageRow, string>;
  image_blobs!: Table<ImageBlobRow, string>;
  sticker_assets!: Table<StickerAsset, string>;
  sync_outbox!: Table<SyncOutboxRow, string>;
  sync_meta!: Table<SyncMetaRow, string>;

  constructor() {
    super("javis-journal");

    this.version(1).stores({
      entries: "id",
      stamps: "id, entry_id",
      placed_stickers: "id",
      profiles: "user_id",
      images: "id",
      sticker_assets: "id",
      sync_outbox: "id, [table+rowId]",
      sync_meta: "table",
    });

    // v2: additive image_blobs store (device-local, never synced).
    // createdAt is indexed for the original-eviction scan.
    this.version(2).stores({
      image_blobs: "id, createdAt",
    });

    // v3 (M4): additive entry_date index on entries so the calendar can range-scan
    // a month (entries.where('entry_date').between(...)). Index only, no data change.
    // ⚠ Coordinate this version number with M5 at merge — one milestone takes v3,
    // the other v4; the migrations are additive and independent.
    this.version(3).stores({
      entries: "id, entry_date",
    });
  }
}

export const db = new JournalDB();
