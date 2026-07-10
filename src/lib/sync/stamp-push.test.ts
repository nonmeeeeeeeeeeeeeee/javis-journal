import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { db } from "../db";
import type { ImageRow } from "../db/types";
import { createMockSupabase } from "./test-utils";
import { getPending, markDirty as outboxMarkDirty } from "./outbox";
import { flush } from "./push";

const holder = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/lib/supabase/browser", () => ({ createClient: () => holder.client }));

type MockCtl = ReturnType<typeof createMockSupabase>;
let ctl: MockCtl;

const ME = "mock-user-id";

function stampImageRow(id: string, mime: "image/webp" | "image/png" = "image/webp"): ImageRow {
  const ext = mime === "image/webp" ? "webp" : "png";
  return {
    id,
    user_id: ME,
    storage_path: `${ME}/${id}.${ext}`,
    thumb_path: `${ME}/${id}_thumb.${ext}`,
    width: 1536,
    height: 2048,
    mime,
    byte_size: 4321,
    created_at: "2026-07-10T00:00:00.000Z",
  };
}

async function seedStamp(id: string, mime: "image/webp" | "image/png" = "image/webp"): Promise<void> {
  await db.images.put(stampImageRow(id, mime));
  await db.image_blobs.put({
    id,
    original: null,
    main: new Blob(["closeup"], { type: mime }),
    thumb: new Blob(["thumb"], { type: mime }),
    kind: "stamp",
    createdAt: Date.now(),
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
    db.images.clear(),
    db.image_blobs.clear(),
    db.sync_outbox.clear(),
    db.entries.clear(),
    db.stamps.clear(),
    db.placed_stickers.clear(),
    db.profiles.clear(),
  ]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

test("uploads BOTH webp objects (closeup + thumb) and the images row, then clears the outbox", async () => {
  await seedStamp("s1", "image/webp");

  const res = await flush();

  expect(res.pushed).toBeGreaterThanOrEqual(1);
  const closeup = ctl.getStorageObject("images", `${ME}/s1.webp`);
  const thumb = ctl.getStorageObject("images", `${ME}/s1_thumb.webp`);
  expect(closeup).toBeTruthy();
  expect(thumb).toBeTruthy();
  // The thumb is uploaded as webp (has alpha) — NOT jpeg like a photo thumb.
  expect(closeup?.contentType).toBe("image/webp");
  expect(thumb?.contentType).toBe("image/webp");
  expect(ctl.store.get("images")?.some((r) => r.id === "s1")).toBe(true);
  expect(await getPending("images")).toHaveLength(0);
});

test("PNG-fallback stamp uploads .png objects with image/png content type", async () => {
  await seedStamp("p1", "image/png");
  await flush();
  expect(ctl.getStorageObject("images", `${ME}/p1.png`)?.contentType).toBe("image/png");
  expect(ctl.getStorageObject("images", `${ME}/p1_thumb.png`)?.contentType).toBe("image/png");
});

test("a storage error quarantines only the offending stamp", async () => {
  await seedStamp("bad", "image/webp");
  ctl.failStorageNext(); // returned (non-network) error on the first upload

  const res = await flush();

  expect((await outboxFor("bad"))?.quarantined).toBe(true);
  expect(res.quarantined).toBeGreaterThanOrEqual(1);
});

test("a storage network failure throws so the engine backs off; the stamp stays dirty", async () => {
  await seedStamp("net", "image/webp");
  ctl.failStorageNext({ throw: true });

  await expect(flush()).rejects.toBeTruthy();

  const pending = await getPending("images");
  expect(pending.map((p) => p.rowId)).toContain("net");
});

test("re-uploading the same stamp is idempotent (deterministic webp paths, upsert-on-id)", async () => {
  await seedStamp("d1", "image/webp");
  await flush();
  await outboxMarkDirty("images", "d1", "upload"); // simulate a retry
  await flush();

  expect(ctl.store.get("images")?.filter((r) => r.id === "d1")).toHaveLength(1);
  expect(ctl.getStorageBucket("images")?.size).toBe(2); // closeup + thumb, not duplicated
});
