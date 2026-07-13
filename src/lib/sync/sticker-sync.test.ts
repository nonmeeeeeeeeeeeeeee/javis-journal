// `sticker_assets` is now a NORMAL LWW TABLE (M7 decision 7), and this is the proof.
//
// Before M7 it was half-wired: pull-only and insert-only, with no push path at all — a tray
// sticker created on her phone would never have reached the server, and a deleted one would have
// resurrected on the next pull (the exact bug ALG-4's tombstones exist to prevent). So the two
// tests that matter are: it PUSHES, and a tombstone SURVIVES a pull.

import { beforeEach, expect, test, vi } from "vitest";

import { db } from "../db";
import type { StickerAsset } from "../db/types";
import { createMockSupabase } from "./test-utils";
import { markDirty as outboxMarkDirty } from "./outbox";
import { flush } from "./push";
import { pullAll, pullLWW } from "./pull";

const holder = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/lib/supabase/browser", () => ({ createClient: () => holder.client }));

type MockCtl = ReturnType<typeof createMockSupabase>;
let ctl: MockCtl;

const ME = "mock-user-id";

function asset(over: Partial<StickerAsset> = {}): StickerAsset {
  return {
    id: "asset-1",
    user_id: ME,
    image_id: "img-1",
    is_seeded: false,
    created_at: "2026-07-13T00:00:00.000Z",
    updated_at: "2026-07-13T00:00:00.000Z",
    deleted_at: null,
    ...over,
  };
}

beforeEach(async () => {
  ctl = createMockSupabase();
  holder.client = ctl.client;
  await db.open();
  await Promise.all([
    db.images.clear(),
    db.image_blobs.clear(),
    db.sync_outbox.clear(),
    db.sticker_assets.clear(),
    db.placed_stickers.clear(),
    db.sync_meta.clear(),
  ]);
});

test("a tray asset created on this device PUSHES to the server (it never did before M7)", async () => {
  await db.sticker_assets.put(asset());
  await outboxMarkDirty("sticker_assets", "asset-1", "upsert");

  const result = await flush();

  expect(result.pushed).toBe(1);
  expect(result.quarantined).toBe(0);
  expect(ctl.store.get("sticker_assets")).toHaveLength(1);
  // …and the outbox row is cleared, so it doesn't push twice.
  expect(await db.sync_outbox.count()).toBe(0);
});

test("a tray asset from another device is pulled in", async () => {
  ctl.store.set("sticker_assets", [asset({ id: "remote-1" })]);

  await pullLWW("sticker_assets");

  expect((await db.sticker_assets.get("remote-1"))?.image_id).toBe("img-1");
});

test("a tombstone propagates — a deleted tray sticker does NOT resurrect on the next pull", async () => {
  await db.sticker_assets.put(asset({ id: "gone" }));
  ctl.store.set("sticker_assets", [
    asset({
      id: "gone",
      deleted_at: "2026-07-14T00:00:00.000Z",
      updated_at: "2026-07-14T00:00:00.000Z",
    }),
  ]);

  await pullLWW("sticker_assets");

  expect(await db.sticker_assets.get("gone")).toBeUndefined();

  // And a second pull (cursor advanced, row still tombstoned server-side) keeps it gone.
  await pullLWW("sticker_assets");
  expect(await db.sticker_assets.get("gone")).toBeUndefined();
});

test("pullAll includes it — the bespoke pullStickerAssets special case is gone", async () => {
  ctl.store.set("sticker_assets", [asset({ id: "remote-2" })]);

  await pullAll();

  expect(await db.sticker_assets.get("remote-2")).toBeDefined();
});
