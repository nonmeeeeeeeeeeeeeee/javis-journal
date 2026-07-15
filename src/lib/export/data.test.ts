import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { db } from "@/lib/db";
import type { Entry, ImageRow, PlacedSticker, Stamp } from "@/lib/db/types";
import type { ImageBlobRow } from "@/lib/db/image-types";
import { createMockSupabase } from "@/lib/sync/test-utils";

const holder = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/lib/supabase/browser", () => ({ createClient: () => holder.client }));

import { loadExportData } from "./data";

let ctl: ReturnType<typeof createMockSupabase>;

function imageRow(id: string, mime = "image/webp"): ImageRow {
  return {
    id,
    user_id: "u",
    storage_path: `u/${id}.bin`,
    thumb_path: `u/${id}_thumb.jpg`,
    width: 2048,
    height: 1024,
    mime,
    byte_size: 100,
    created_at: "2026-07-01T00:00:00.000Z",
  };
}

function blobRow(id: string, over: Partial<ImageBlobRow>): ImageBlobRow {
  return {
    id,
    original: null,
    main: null,
    thumb: null,
    kind: "photo",
    createdAt: Date.now(),
    ...over,
  };
}

function entry(id: string, date: string): Entry {
  return {
    id,
    user_id: "u",
    entry_date: date,
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
  };
}

function stamp(over: Partial<Stamp>): Stamp {
  return {
    id: "s",
    entry_id: "e",
    user_id: "u",
    image_id: "img",
    mask_type: "circle",
    pos_x: 0.5,
    pos_y: 0.5,
    scale: 0.4,
    rotation_deg: 0,
    layer_order: 0,
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
    deleted_at: null,
    ...over,
  };
}

function sticker(over: Partial<PlacedSticker>): PlacedSticker {
  return {
    id: "k",
    user_id: "u",
    image_id: "pimg",
    sticker_asset_id: "a",
    year_month: "2026-07",
    pos_x: 0.4,
    pos_y: 0.4,
    scale: 0.2,
    rotation_deg: 0,
    layer_order: 0,
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
    deleted_at: null,
    ...over,
  };
}

beforeEach(async () => {
  ctl = createMockSupabase();
  holder.client = ctl.client;
  await db.open();
  await Promise.all([
    db.entries.clear(),
    db.stamps.clear(),
    db.placed_stickers.clear(),
    db.images.clear(),
    db.image_blobs.clear(),
  ]);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test("uses the local thumb for a stamp and the local main for a sticker — no signing", async () => {
  const thumb = new Blob(["thumb"], { type: "image/jpeg" });
  const main = new Blob(["main"], { type: "image/png" });

  await db.entries.put(entry("e", "2026-07-05"));
  await db.stamps.put(stamp({ id: "s", entry_id: "e", image_id: "img" }));
  await db.placed_stickers.put(sticker({ id: "k", image_id: "pimg" }));
  await db.images.bulkPut([imageRow("img"), imageRow("pimg", "image/png")]);
  await db.image_blobs.put(blobRow("img", { thumb }));
  await db.image_blobs.put(blobRow("pimg", { main }));

  const data = await loadExportData(2026, 7);

  expect(data.stampsByDate.get("2026-07-05")?.[0].id).toBe("s");
  expect(data.stickers.map((s) => s.id)).toEqual(["k"]);
  // Dexie structured-clones blobs, so compare content, not identity.
  expect(await data.stampBlobs.get("img")?.text()).toBe("thumb");
  expect(await data.stickerBlobs.get("pimg")?.text()).toBe("main");
  expect(data.aspects.get("img")).toBeCloseTo(2, 6);
  expect(ctl.getSignedUrlCallCount()).toBe(0);
});

test("falls back to a signed-URL fetch when the local blob is missing", async () => {
  await db.entries.put(entry("e", "2026-07-05"));
  await db.stamps.put(stamp({ id: "s", entry_id: "e", image_id: "img" }));
  await db.images.put(imageRow("img"));
  // No image_blobs row → remote miss.

  const downloaded = new Blob(["remote-thumb"], { type: "image/jpeg" });
  const fetchMock = vi.fn(async () => ({ ok: true, blob: async () => downloaded }));
  vi.stubGlobal("fetch", fetchMock);

  const data = await loadExportData(2026, 7);

  expect(ctl.getSignedUrlCallCount()).toBe(1);
  expect(fetchMock).toHaveBeenCalledOnce();
  expect(data.stampBlobs.get("img")).toBe(downloaded);
});

test("a total miss (offline AND not on device) is skipped, not fatal", async () => {
  await db.entries.put(entry("e", "2026-07-05"));
  await db.stamps.put(stamp({ id: "s", entry_id: "e", image_id: "img" }));
  await db.images.put(imageRow("img"));

  // Signing works but the fetch fails (offline) → the one image is dropped.
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false })));

  const data = await loadExportData(2026, 7);

  expect(data.stampsByDate.get("2026-07-05")?.[0].id).toBe("s"); // row still present
  expect(data.stampBlobs.has("img")).toBe(false); // blob skipped
});

test("a sign failure (no image row) drops the blob without throwing", async () => {
  await db.entries.put(entry("e", "2026-07-05"));
  await db.stamps.put(stamp({ id: "s", entry_id: "e", image_id: "img" }));
  // No images row and no blob row → nothing to sign, nothing to fetch.

  const data = await loadExportData(2026, 7);
  expect(data.stampBlobs.has("img")).toBe(false);
  expect(ctl.getSignedUrlCallCount()).toBe(0);
});

test("tombstoned stamps and stickers are excluded", async () => {
  await db.entries.put(entry("e", "2026-07-05"));
  await db.stamps.put(stamp({ id: "s", entry_id: "e", deleted_at: "2026-07-06T00:00:00Z" }));
  await db.placed_stickers.put(sticker({ id: "k", deleted_at: "2026-07-06T00:00:00Z" }));

  const data = await loadExportData(2026, 7);
  expect(data.stampsByDate.size).toBe(0);
  expect(data.stickers).toHaveLength(0);
});

test("only the viewed month's rows are read (not a neighbouring month)", async () => {
  await db.entries.bulkPut([entry("e1", "2026-07-05"), entry("e2", "2026-08-05")]);
  await db.stamps.bulkPut([
    stamp({ id: "s1", entry_id: "e1" }),
    stamp({ id: "s2", entry_id: "e2" }),
  ]);
  await db.placed_stickers.bulkPut([
    sticker({ id: "k1", year_month: "2026-07" }),
    sticker({ id: "k2", year_month: "2026-08" }),
  ]);

  const data = await loadExportData(2026, 7);
  expect([...data.stampsByDate.keys()]).toEqual(["2026-07-05"]);
  expect(data.stickers.map((s) => s.id)).toEqual(["k1"]);
});
