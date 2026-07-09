import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { db } from "../db";
import type { ImageRow } from "../db/types";
import { evictOriginals, ORIGINAL_RETENTION_MS } from "@/lib/image/eviction";
import { createMockSupabase } from "./test-utils";
import { getPending, markDirty as outboxMarkDirty } from "./outbox";
import { flush } from "./push";

const holder = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/lib/supabase/browser", () => ({ createClient: () => holder.client }));

type MockCtl = ReturnType<typeof createMockSupabase>;
let ctl: MockCtl;

const ME = "mock-user-id";

function imageRow(id: string): ImageRow {
  return {
    id,
    user_id: ME,
    storage_path: `${ME}/${id}.jpg`,
    thumb_path: `${ME}/${id}_thumb.jpg`,
    width: 2048,
    height: 1536,
    mime: "image/jpeg",
    byte_size: 100,
    created_at: "2026-07-09T00:00:00.000Z",
  };
}

async function seedImage(id: string, createdAt: number = Date.now()): Promise<void> {
  await db.images.put(imageRow(id));
  await db.image_blobs.put({
    id,
    original: new Blob(["orig"]),
    main: new Blob(["main"]),
    thumb: new Blob(["thumb"]),
    kind: "photo",
    createdAt,
  });
  await outboxMarkDirty("images", id, "upload");
}

function outboxFor(id: string) {
  return db.sync_outbox.where("[table+rowId]").equals(["images", id]).first();
}

beforeEach(async () => {
  ctl = createMockSupabase();
  holder.client = ctl.client;
  await db.open();
  await Promise.all([
    db.entries.clear(),
    db.stamps.clear(),
    db.placed_stickers.clear(),
    db.profiles.clear(),
    db.images.clear(),
    db.image_blobs.clear(),
    db.sticker_assets.clear(),
    db.sync_outbox.clear(),
    db.sync_meta.clear(),
  ]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

test("uploads main + thumb blobs and the images row, then clears the outbox", async () => {
  await seedImage("i1");

  const res = await flush();

  expect(res.pushed).toBeGreaterThanOrEqual(1);
  expect(ctl.getStorageObject("images", `${ME}/i1.jpg`)).toBeTruthy();
  expect(ctl.getStorageObject("images", `${ME}/i1_thumb.jpg`)).toBeTruthy();
  expect(ctl.store.get("images")?.some((r) => r.id === "i1")).toBe(true);
  expect(await getPending("images")).toHaveLength(0);
});

test("quarantines an image whose local blobs are missing while others proceed", async () => {
  await seedImage("good");
  // An outbox + images row with no image_blobs is a poison pill.
  await db.images.put(imageRow("orphan"));
  await outboxMarkDirty("images", "orphan", "upload");

  await flush();

  expect(ctl.store.get("images")?.some((r) => r.id === "good")).toBe(true);
  expect((await outboxFor("orphan"))?.quarantined).toBe(true);
  expect(await outboxFor("good")).toBeUndefined();
});

test("a storage upload error quarantines only that image", async () => {
  await seedImage("s1");
  ctl.failStorageNext(); // returned (non-network) error on the first upload

  const res = await flush();

  expect((await outboxFor("s1"))?.quarantined).toBe(true);
  expect(res.quarantined).toBeGreaterThanOrEqual(1);
});

test("a storage network failure throws so the engine backs off; the row stays dirty", async () => {
  await seedImage("n1");
  ctl.failStorageNext({ throw: true });

  await expect(flush()).rejects.toBeTruthy();

  const pending = await getPending("images");
  expect(pending.map((p) => p.rowId)).toContain("n1");
});

test("re-uploading the same image is idempotent (upsert-on-id, deterministic paths)", async () => {
  await seedImage("d1");
  await flush();

  await outboxMarkDirty("images", "d1", "upload"); // simulate a retry
  await flush();

  expect(ctl.store.get("images")?.filter((r) => r.id === "d1")).toHaveLength(1);
  expect(ctl.getStorageBucket("images")?.size).toBe(2); // main + thumb, not duplicated
});

// ---- Eviction interlock ----

test("keeps the original while an upload outbox row is still pending", async () => {
  await seedImage("e1", Date.now() - (ORIGINAL_RETENTION_MS + 1000));

  const evicted = await evictOriginals();

  expect(evicted).toBe(0);
  expect((await db.image_blobs.get("e1"))?.original).toBeInstanceOf(Blob);
});

test("keeps a recent original even after the upload is durable", async () => {
  await seedImage("e2", Date.now());
  await flush(); // durable: outbox cleared

  const evicted = await evictOriginals();

  expect(evicted).toBe(0);
  expect((await db.image_blobs.get("e2"))?.original).toBeInstanceOf(Blob);
});

test("drops the original once old AND durably uploaded; keeps main + thumb", async () => {
  await seedImage("e3", Date.now() - (ORIGINAL_RETENTION_MS + 1000));
  await flush(); // durable: outbox cleared

  const evicted = await evictOriginals();

  expect(evicted).toBe(1);
  const blob = await db.image_blobs.get("e3");
  expect(blob?.original).toBeNull();
  expect(blob?.main).toBeInstanceOf(Blob);
  expect(blob?.thumb).toBeInstanceOf(Blob);
});

test("keeps the original while a quarantined outbox row exists (not yet durable)", async () => {
  await seedImage("e4", Date.now() - (ORIGINAL_RETENTION_MS + 1000));
  ctl.failStorageNext(); // upload fails -> quarantine
  await flush();
  expect((await outboxFor("e4"))?.quarantined).toBe(true);

  const evicted = await evictOriginals();

  expect(evicted).toBe(0);
  expect((await db.image_blobs.get("e4"))?.original).toBeInstanceOf(Blob);
});
