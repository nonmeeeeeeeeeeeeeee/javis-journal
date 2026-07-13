// The sticker write path (M7 DoD, Tier 1): every write goes through the outbox exactly once;
// stickers are MONTH-BOUNDED (the headline reversal); delete is an optimistic soft-delete that
// Undo restores IN PLACE; a seeded tray asset cannot be tombstoned; deleting a tray asset leaves
// its already-placed instances alone; and the seeder is idempotent across devices.

import { beforeEach, describe, expect, test, vi } from "vitest";

import { db } from "@/lib/db";
import type { ImageRow } from "@/lib/db/types";
import { STICKER } from "@/lib/sticker/place";

vi.mock("@/lib/supabase/browser", () => ({ createClient: () => ({}) }));
vi.mock("@/lib/sync/engine", () => ({
  markDirty: vi.fn(async () => {}),
  scheduleFlush: vi.fn(),
}));

import {
  DayWriteError,
  addTrayAsset,
  deletePlacedSticker,
  deleteTrayAsset,
  placeSticker,
  restorePlacedSticker,
  restoreTrayAsset,
  updatePlacedSticker,
} from "./mutations";

const USER = "user-1";
const JULY = "2026-07";
const AUGUST = "2026-08";
const CENTER = { x: 0.5, y: 0.5 };

function imageRow(id: string, width = 512, height = 512): ImageRow {
  return {
    id,
    user_id: USER,
    storage_path: `u/${id}.png`,
    thumb_path: `u/${id}-t.jpg`,
    width,
    height,
    mime: "image/png",
    byte_size: 1000,
    created_at: "2026-07-13T00:00:00.000Z",
  };
}

async function outboxFor(table: string, rowId: string) {
  return db.sync_outbox.where("[table+rowId]").equals([table, rowId]).first();
}

beforeEach(async () => {
  await db.open();
  await Promise.all([
    db.images.clear(),
    db.placed_stickers.clear(),
    db.sticker_assets.clear(),
    db.sync_outbox.clear(),
  ]);
  await db.images.put(imageRow("img1"));
});

describe("placing a sticker on a month", () => {
  test("it is written once, through the outbox, carrying its year_month", async () => {
    const placed = await placeSticker(JULY, "img1", "asset1", CENTER);
    expect(placed).not.toBeNull();

    const row = await db.placed_stickers.get(placed!.id);
    expect(row?.year_month).toBe(JULY);
    expect(row?.user_id).toBe(USER);
    expect(row?.sticker_asset_id).toBe("asset1");
    expect(row?.deleted_at).toBeNull();

    const outbox = await outboxFor("placed_stickers", placed!.id);
    expect(outbox?.op).toBe("upsert");
    expect(await db.sync_outbox.count()).toBe(1); // exactly one write
  });

  test("MONTH-BOUNDED: a sticker placed on July is absent from August", async () => {
    await placeSticker(JULY, "img1", "asset1", CENTER);

    const july = await db.placed_stickers.where("year_month").equals(JULY).toArray();
    const august = await db.placed_stickers.where("year_month").equals(AUGUST).toArray();

    expect(july).toHaveLength(1);
    expect(august).toHaveLength(0);
  });

  test("the cap holds at 50 per month — and it is per MONTH, not global", async () => {
    for (let i = 0; i < STICKER.MAX_PER_MONTH; i++) {
      expect(await placeSticker(JULY, "img1", "asset1", CENTER)).not.toBeNull();
    }
    expect(await placeSticker(JULY, "img1", "asset1", CENTER)).toBeNull();
    expect(await db.placed_stickers.where("year_month").equals(JULY).count()).toBe(
      STICKER.MAX_PER_MONTH,
    );

    // August has its own 50.
    expect(await placeSticker(AUGUST, "img1", "asset1", CENTER)).not.toBeNull();
  });

  test("fail-closed: an unknown image writes nothing", async () => {
    await expect(placeSticker(JULY, "nope", null, CENTER)).rejects.toBeInstanceOf(DayWriteError);
    expect(await db.placed_stickers.count()).toBe(0);
    expect(await db.sync_outbox.count()).toBe(0);
  });
});

describe("editing and deleting a placed sticker", () => {
  test("a gesture commit is ONE write, and bumps updated_at", async () => {
    const placed = (await placeSticker(JULY, "img1", null, CENTER))!;
    const before = (await db.placed_stickers.get(placed.id))!.updated_at;
    await db.sync_outbox.clear();

    await updatePlacedSticker(placed.id, { pos_x: 0.2, pos_y: 0.3, rotation_deg: 45 });

    const row = (await db.placed_stickers.get(placed.id))!;
    expect(row.pos_x).toBeCloseTo(0.2);
    expect(row.rotation_deg).toBe(45);
    expect(row.updated_at >= before).toBe(true);
    expect(await db.sync_outbox.count()).toBe(1);
  });

  test("delete is an optimistic soft-delete; Undo restores the ORIGINAL layer_order", async () => {
    const placed = (await placeSticker(JULY, "img1", null, CENTER))!;
    await updatePlacedSticker(placed.id, { layer_order: 7 });

    const layerOrder = await deletePlacedSticker(placed.id);
    expect(layerOrder).toBe(7);

    const deleted = (await db.placed_stickers.get(placed.id))!;
    expect(deleted.deleted_at).not.toBeNull(); // durable immediately, not deferred
    expect(await outboxFor("placed_stickers", placed.id)).toBeDefined();

    await restorePlacedSticker(placed.id, layerOrder!);
    const restored = (await db.placed_stickers.get(placed.id))!;
    expect(restored.deleted_at).toBeNull();
    expect(restored.layer_order).toBe(7); // back exactly where it was, not on top
    expect(restored.updated_at >= deleted.updated_at).toBe(true); // a NEWER write wins by LWW
  });

  test("deleting an already-deleted sticker writes nothing", async () => {
    const placed = (await placeSticker(JULY, "img1", null, CENTER))!;
    await deletePlacedSticker(placed.id);
    expect(await deletePlacedSticker(placed.id)).toBeNull();
  });
});

describe("the tray", () => {
  test("an uploaded asset is added, then soft-deleted, then restorable", async () => {
    const asset = await addTrayAsset("img1");
    expect(asset.is_seeded).toBe(false);
    expect(await outboxFor("sticker_assets", asset.id)).toBeDefined();

    expect(await deleteTrayAsset(asset.id)).toBe(true);
    const deleted = (await db.sticker_assets.get(asset.id))!;
    expect(deleted.deleted_at).not.toBeNull(); // a tombstone, not a hard delete: it cannot
    // resurrect on the next pull

    await restoreTrayAsset(asset.id);
    expect((await db.sticker_assets.get(asset.id))!.deleted_at).toBeNull();
  });

  test("a SEEDED asset cannot be tombstoned (the client guard; the trigger is the other half)", async () => {
    const seeded = await addTrayAsset("img1", { id: "seed-1", isSeeded: true });

    expect(await deleteTrayAsset(seeded.id)).toBe(false);
    expect((await db.sticker_assets.get(seeded.id))!.deleted_at).toBeNull();
  });

  test("deleting a tray asset leaves its already-placed instances alone", async () => {
    const asset = await addTrayAsset("img1");
    const placed = (await placeSticker(JULY, "img1", asset.id, CENTER))!;

    await deleteTrayAsset(asset.id);

    const row = (await db.placed_stickers.get(placed.id))!;
    expect(row.deleted_at).toBeNull(); // it renders from its own image_id
    expect(row.image_id).toBe("img1");
  });
});

describe("seeding", () => {
  test("the ids are deterministic per user — a second device upserts, it never duplicates", async () => {
    const { deterministicId } = await import("@/lib/sticker/seed");

    const a = await deterministicId(USER, "sticker_asset:sticker_01");
    const b = await deterministicId(USER, "sticker_asset:sticker_01");
    expect(a).toBe(b); // same user, same slug → the same primary key on every device

    // …and never collides across accounts, or across the two rows one seed writes.
    expect(await deterministicId("other-user", "sticker_asset:sticker_01")).not.toBe(a);
    expect(await deterministicId(USER, "image:sticker_01")).not.toBe(a);
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  test("adding the same seeded asset twice leaves ONE tray row (idempotent)", async () => {
    await addTrayAsset("img1", { id: "seed-1", isSeeded: true });
    await addTrayAsset("img1", { id: "seed-1", isSeeded: true }); // the second device

    expect(await db.sticker_assets.count()).toBe(1);
    expect((await db.sticker_assets.get("seed-1"))!.is_seeded).toBe(true);
  });
});
