import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { db } from "@/lib/db";
import type { ImageRow } from "@/lib/db/types";
import { createMockSupabase } from "@/lib/sync/test-utils";

const holder = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/lib/supabase/browser", () => ({ createClient: () => holder.client }));

import {
  __resetThumbUrlCacheForTests,
  __setLiveUrlCapForTests,
  getCloseupUrl,
  getThumbUrl,
  getThumbUrls,
} from "./thumb-url";

type MockCtl = ReturnType<typeof createMockSupabase>;
let ctl: MockCtl;

let objectUrlSeq = 0;
const revoked: string[] = [];
const urlShim = URL as unknown as {
  createObjectURL: (b: Blob) => string;
  revokeObjectURL: (u: string) => void;
};

function thumbRow(id: string, kind: "photo" | "sticker" = "photo") {
  return {
    id,
    original: null,
    main: null,
    thumb: new Blob(["thumb"], { type: "image/jpeg" }),
    kind,
    createdAt: Date.now(),
  };
}

function imageRow(id: string): ImageRow {
  return {
    id,
    user_id: "mock-user-id",
    storage_path: `mock-user-id/${id}.jpg`,
    thumb_path: `mock-user-id/${id}_thumb.jpg`,
    width: 2048,
    height: 1536,
    mime: "image/jpeg",
    byte_size: 100,
    created_at: "2026-07-09T00:00:00.000Z",
  };
}

beforeEach(async () => {
  ctl = createMockSupabase();
  holder.client = ctl.client;

  objectUrlSeq = 0;
  revoked.length = 0;
  urlShim.createObjectURL = () => `blob:mock/${++objectUrlSeq}`;
  urlShim.revokeObjectURL = (u: string) => {
    revoked.push(u);
  };

  await db.open();
  await Promise.all([db.images.clear(), db.image_blobs.clear()]);
  __resetThumbUrlCacheForTests();
});

afterEach(() => {
  __resetThumbUrlCacheForTests();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test("resolves a local thumb as an object URL without signing", async () => {
  await db.image_blobs.put(thumbRow("a"));

  const handle = await getThumbUrl("a");
  expect(handle?.url).toMatch(/^blob:mock\//);
  expect(ctl.getSignedUrlCallCount()).toBe(0);
});

test("release() revokes the object URL exactly once", async () => {
  await db.image_blobs.put(thumbRow("a"));

  const handle = await getThumbUrl("a");
  handle?.release();
  handle?.release();
  expect(revoked).toHaveLength(1);
  expect(revoked[0]).toBe(handle?.url);
});

test("falls back to a signed URL (release no-op) and lazily backfills the thumb", async () => {
  await db.images.put(imageRow("b"));
  const fetchMock = vi.fn(async () => ({
    ok: true,
    blob: async () => new Blob(["downloaded"], { type: "image/jpeg" }),
  }));
  vi.stubGlobal("fetch", fetchMock);

  const handle = await getThumbUrl("b");
  expect(handle?.url).toContain("mock.storage");
  handle?.release(); // signed URL -> no revocation
  expect(revoked).toHaveLength(0);

  await vi.waitFor(async () => {
    const blob = await db.image_blobs.get("b");
    expect(blob?.thumb).toBeInstanceOf(Blob);
    expect(blob?.main).toBeNull();
  });
});

test("caches signed URLs within the 24h TTL (one sign per id)", async () => {
  await db.images.put(imageRow("c"));
  // Fail the backfill so the id stays remote and the second call re-hits the cache.
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false })));

  await getThumbUrl("c");
  await getThumbUrl("c");
  expect(ctl.getSignedUrlCallCount()).toBe(1);
});

test("returns null for an unknown image", async () => {
  expect(await getThumbUrl("nope")).toBeNull();
});

test("the LRU cap revokes the oldest live object URL", async () => {
  __setLiveUrlCapForTests(2);
  await db.image_blobs.bulkPut([thumbRow("x"), thumbRow("y"), thumbRow("z")]);

  const hx = await getThumbUrl("x");
  await getThumbUrl("y");
  const hz = await getThumbUrl("z"); // 3rd live URL exceeds cap 2 -> oldest (x) revoked

  expect(revoked).toContain(hx?.url);
  expect(revoked).not.toContain(hz?.url);
});

test("getThumbUrls resolves local + remote misses in one batch", async () => {
  await db.image_blobs.put(thumbRow("local"));
  await db.images.put(imageRow("remote"));
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false })));

  const map = await getThumbUrls(["local", "remote"]);
  expect(map.get("local")?.url).toMatch(/^blob:mock\//);
  expect(map.get("remote")?.url).toContain("mock.storage");
  expect(ctl.getSignedUrlCallCount()).toBe(1); // single createSignedUrls round-trip
});

// ---- getCloseupUrl (M5 day-page closeup / baked stamp) ----

function stampBlobRow(id: string) {
  return {
    id,
    original: null,
    main: new Blob(["closeup"], { type: "image/webp" }),
    thumb: new Blob(["thumb"], { type: "image/webp" }),
    kind: "stamp" as const,
    createdAt: Date.now(),
  };
}

function stampImageRow(id: string): ImageRow {
  return {
    id,
    user_id: "mock-user-id",
    storage_path: `mock-user-id/${id}.webp`,
    thumb_path: `mock-user-id/${id}_thumb.webp`,
    width: 1536,
    height: 2048,
    mime: "image/webp",
    byte_size: 100,
    created_at: "2026-07-10T00:00:00.000Z",
  };
}

test("getCloseupUrl resolves the local main blob as an object URL without signing", async () => {
  await db.image_blobs.put(stampBlobRow("c1"));
  const handle = await getCloseupUrl("c1");
  expect(handle?.url).toMatch(/^blob:mock\//);
  expect(ctl.getSignedUrlCallCount()).toBe(0);
});

test("getCloseupUrl falls back to a signed storage_path and backfills main locally", async () => {
  await db.images.put(stampImageRow("c2"));
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, blob: async () => new Blob(["dl"], { type: "image/webp" }) })),
  );

  const handle = await getCloseupUrl("c2");
  expect(handle?.url).toContain("mock.storage");
  expect(handle?.url).toContain("c2.webp"); // the CLOSEUP object, not the thumb

  await vi.waitFor(async () => {
    const blob = await db.image_blobs.get("c2");
    expect(blob?.main).toBeInstanceOf(Blob);
    expect(blob?.thumb).toBeNull(); // grid thumb backfills separately
  });
});

test("closeup and thumb signed URLs do not collide on the same id (cache keyed by path)", async () => {
  await db.images.put(stampImageRow("c3"));
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false }))); // keep both remote

  const thumb = await getThumbUrl("c3");
  const closeup = await getCloseupUrl("c3");
  expect(thumb?.url).toContain("c3_thumb.webp");
  expect(closeup?.url).toContain("c3.webp");
  expect(closeup?.url).not.toBe(thumb?.url);
  expect(ctl.getSignedUrlCallCount()).toBe(2); // two distinct objects → two signs
});

test("getCloseupUrl returns null for an unknown image", async () => {
  expect(await getCloseupUrl("nope")).toBeNull();
});
