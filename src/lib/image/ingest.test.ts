import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { db } from "@/lib/db";
import { createMockSupabase } from "@/lib/sync/test-utils";

// ingest.ts calls processImage (worker/canvas — unavailable in node) and createClient.
// Redirect both to hoisted holders the tests drive.
const holder = vi.hoisted(() => ({
  client: null as unknown,
  process: null as unknown,
}));

vi.mock("@/lib/supabase/browser", () => ({ createClient: () => holder.client }));
vi.mock("./host", () => ({
  processImage: (...args: unknown[]) =>
    (holder.process as (...a: unknown[]) => unknown)(...args),
}));

import { ingestImage } from "./ingest";
import { ImagePipelineError } from "./process";
import { __resetEngineForTests } from "@/lib/sync/engine";

function fakeFile(content = "orig"): File {
  // A Blob is a structurally-adequate stand-in (ingest uses it only as a blob + map key).
  return new Blob([content], { type: "image/jpeg" }) as unknown as File;
}

function okProcess() {
  return vi.fn(async () => ({
    mainBlob: new Blob(["main"], { type: "image/jpeg" }),
    thumbBlob: new Blob(["thumb"], { type: "image/jpeg" }),
    width: 2048,
    height: 1536,
  }));
}

beforeEach(async () => {
  holder.client = createMockSupabase().client;
  holder.process = okProcess();
  await db.open();
  await Promise.all([db.images.clear(), db.image_blobs.clear(), db.sync_outbox.clear()]);
});

afterEach(() => {
  // ingest now arms the engine's debounced flush; clear it so no timer leaks across tests.
  __resetEngineForTests();
  vi.restoreAllMocks();
});

test("ingest writes blobs + images row + an 'upload' outbox marker", async () => {
  const id = await ingestImage(fakeFile(), "photo");

  const blob = await db.image_blobs.get(id);
  expect(blob?.original).toBeInstanceOf(Blob);
  expect(blob?.main).toBeInstanceOf(Blob);
  expect(blob?.thumb).toBeInstanceOf(Blob);
  expect(blob?.kind).toBe("photo");

  const row = await db.images.get(id);
  expect(row?.storage_path).toBe(`mock-user-id/${id}.jpg`);
  expect(row?.thumb_path).toBe(`mock-user-id/${id}_thumb.jpg`);
  expect(row?.width).toBe(2048);
  expect(row?.height).toBe(1536);
  expect(row?.mime).toBe("image/jpeg");

  const outbox = await db.sync_outbox
    .where("[table+rowId]")
    .equals(["images", id])
    .first();
  expect(outbox?.op).toBe("upload");
});

test("a concurrent double-pick of the same File ingests exactly once", async () => {
  const file = fakeFile();
  const [id1, id2] = await Promise.all([ingestImage(file), ingestImage(file)]);

  expect(id1).toBe(id2);
  expect(holder.process).toHaveBeenCalledTimes(1);
  expect(await db.images.count()).toBe(1);
  expect(await db.image_blobs.count()).toBe(1);
});

test("a pipeline failure is fail-closed: throws and writes nothing", async () => {
  holder.process = vi.fn(async () => {
    throw new ImagePipelineError("decode failed");
  });

  await expect(ingestImage(fakeFile())).rejects.toBeInstanceOf(ImagePipelineError);

  expect(await db.images.count()).toBe(0);
  expect(await db.image_blobs.count()).toBe(0);
  expect(await db.sync_outbox.count()).toBe(0);
});

test("a non-pipeline failure is wrapped as ImagePipelineError and still writes nothing", async () => {
  holder.process = vi.fn(async () => {
    throw new Error("unexpected");
  });

  await expect(ingestImage(fakeFile())).rejects.toBeInstanceOf(ImagePipelineError);
  expect(await db.images.count()).toBe(0);
});
