import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { db } from "@/lib/db";
import { ImagePipelineError } from "@/lib/image/process";
import { createMockSupabase } from "@/lib/sync/test-utils";
import { __resetEngineForTests } from "@/lib/sync/engine";

const holder = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/lib/supabase/browser", () => ({ createClient: () => holder.client }));

import { ingestStamp } from "./ingest-stamp";
import type { BakeResult } from "./bake";

function fakeBake(mime: "image/webp" | "image/png" = "image/webp"): BakeResult {
  return {
    closeupBlob: new Blob(["closeup-pixels"], { type: mime }),
    thumbBlob: new Blob(["thumb"], { type: mime }),
    width: 1536,
    height: 2048,
    mime,
  };
}

beforeEach(async () => {
  holder.client = createMockSupabase().client;
  await db.open();
  await Promise.all([db.images.clear(), db.image_blobs.clear(), db.sync_outbox.clear()]);
});

afterEach(() => {
  __resetEngineForTests();
  vi.restoreAllMocks();
});

test("ingestStamp writes image_blobs(kind:'stamp') + images row + an 'upload' marker atomically", async () => {
  const bake = fakeBake("image/webp");
  const id = await ingestStamp(bake);

  const blob = await db.image_blobs.get(id);
  expect(blob?.kind).toBe("stamp");
  expect(blob?.original).toBeNull(); // the raw photo is transient (ADR-M5)
  // fake-indexeddb structured-clones blobs on round-trip, so compare by content, not identity.
  expect(blob?.main?.size).toBe(bake.closeupBlob.size); // closeup === main
  expect(blob?.main?.type).toBe("image/webp");
  expect(blob?.thumb?.size).toBe(bake.thumbBlob.size);

  const row = await db.images.get(id);
  expect(row?.storage_path).toBe(`mock-user-id/${id}.webp`);
  expect(row?.thumb_path).toBe(`mock-user-id/${id}_thumb.webp`);
  expect(row?.mime).toBe("image/webp");
  expect(row?.width).toBe(1536);
  expect(row?.height).toBe(2048);
  expect(row?.byte_size).toBe(bake.closeupBlob.size);

  const outbox = await db.sync_outbox.where("[table+rowId]").equals(["images", id]).first();
  expect(outbox?.op).toBe("upload");
});

test("the PNG-alpha fallback bake is stored with .png paths + image/png mime", async () => {
  const id = await ingestStamp(fakeBake("image/png"));
  const row = await db.images.get(id);
  expect(row?.mime).toBe("image/png");
  expect(row?.storage_path).toBe(`mock-user-id/${id}.png`);
  expect(row?.thumb_path).toBe(`mock-user-id/${id}_thumb.png`);
});

test("fail-closed: an incomplete bake throws and writes nothing", async () => {
  const bad = { ...fakeBake(), closeupBlob: null } as unknown as BakeResult;

  await expect(ingestStamp(bad)).rejects.toBeInstanceOf(ImagePipelineError);

  expect(await db.images.count()).toBe(0);
  expect(await db.image_blobs.count()).toBe(0);
  expect(await db.sync_outbox.count()).toBe(0);
});
