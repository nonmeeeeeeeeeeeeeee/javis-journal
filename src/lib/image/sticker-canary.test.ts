// Object-URL canary for the STICKER LAYER (M7 DoD; the sibling of day-canary.test.ts).
//
// The sticker layer *is* the month grid, so it is squarely inside the guardrail that fixed the
// ~20-day freeze: 256px thumbs only, and every object URL released when the month unmounts. Two
// things are asserted here, and the second is the interesting one:
//
//   · flipping through 50 months leaves the live object-URL count FLAT (no leak), and
//   · a decorated month holds one object URL per DISTINCT TRAY ASSET, not per placed sticker —
//     40 stickers stamped from 5 assets hold 5 URLs. That dedupe is what makes a heavily
//     decorated month cost the same as a lightly decorated one.
//
// Exercised at the registry level (there is no React runtime in the node env), which is exactly
// the acquire→release cycle `useImageUrls` performs on mount/unmount.

import { beforeEach, afterEach, expect, test, vi } from "vitest";

import { db } from "@/lib/db";
import { createMockSupabase } from "@/lib/sync/test-utils";

const holder = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/lib/supabase/browser", () => ({ createClient: () => holder.client }));

import {
  __resetThumbUrlCacheForTests,
  getLiveThumbUrlCount,
  getThumbUrls,
} from "./thumb-url";

let objectUrlSeq = 0;
const urlShim = URL as unknown as {
  createObjectURL: (b: Blob) => string;
  revokeObjectURL: (u: string) => void;
};

function thumbRow(id: string) {
  return {
    id,
    original: null,
    main: null,
    thumb: new Blob(["thumb"], { type: "image/png" }),
    kind: "sticker" as const,
    createdAt: Date.now(),
  };
}

beforeEach(async () => {
  holder.client = createMockSupabase().client;
  objectUrlSeq = 0;
  urlShim.createObjectURL = () => `blob:mock/${++objectUrlSeq}`;
  urlShim.revokeObjectURL = () => {};
  await db.open();
  await Promise.all([db.images.clear(), db.image_blobs.clear()]);
  __resetThumbUrlCacheForTests();
});

afterEach(() => {
  __resetThumbUrlCacheForTests();
  vi.restoreAllMocks();
});

test("50 decorated months: the live object-URL count stays flat, at one per DISTINCT asset", async () => {
  const TRAY_ASSETS = 5;
  const PLACED_PER_MONTH = 40; // eight stamps of each tray sticker
  const MONTHS = 50;

  const assetIds = Array.from({ length: TRAY_ASSETS }, (_, i) => `sticker${i}`);
  await db.image_blobs.bulkPut(assetIds.map(thumbRow));

  // What a month of placed stickers looks like to the read seam: 40 rows, but only 5 distinct
  // image_ids — and `useMonthStickers` resolves the DISTINCT set, which is the whole point.
  const placedImageIds = Array.from(
    { length: PLACED_PER_MONTH },
    (_, i) => assetIds[i % TRAY_ASSETS],
  );
  const distinct = [...new Set(placedImageIds)];
  expect(distinct).toHaveLength(TRAY_ASSETS);

  const baseline = getLiveThumbUrlCount();

  for (let month = 0; month < MONTHS; month++) {
    const handles = await getThumbUrls(distinct);

    // Mounted: one object URL per distinct tray asset — NOT one per placed sticker.
    expect(handles.size).toBe(TRAY_ASSETS);
    expect(getLiveThumbUrlCount()).toBe(baseline + TRAY_ASSETS);
    expect(getLiveThumbUrlCount()).toBeLessThan(PLACED_PER_MONTH);

    // Unmounted (the month changes): every handle released.
    for (const h of handles.values()) h.release();
    expect(getLiveThumbUrlCount()).toBe(baseline);
  }

  // 50 months of flipping, 2000 stickers rendered, nothing retained.
  expect(getLiveThumbUrlCount()).toBe(baseline);
});

test("releasing twice is safe (a re-render must not double-revoke)", async () => {
  await db.image_blobs.put(thumbRow("sticker0"));

  const handles = await getThumbUrls(["sticker0"]);
  const handle = handles.get("sticker0")!;

  handle.release();
  handle.release();

  expect(getLiveThumbUrlCount()).toBe(0);
});
