// Object-URL canary for the DAY PAGE (M6 DoD; the sibling of thumb-url-canary.test.ts).
//
// The day page resolves 2048px CLOSEUPS — the heaviest images in the app — and holds them for
// as long as the overlay is open. If `useDayView` ever stops releasing them, opening days would
// leak the exact memory ALG-6 exists to bound (the ~20-day freeze). This exercises that
// acquire→release cycle at the registry level (no React runtime in the node env) and asserts the
// live-URL count returns to baseline after every close, and never grows across 50 open/closes.

import { beforeEach, afterEach, expect, test, vi } from "vitest";

import { db } from "@/lib/db";
import { createMockSupabase } from "@/lib/sync/test-utils";

const holder = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/lib/supabase/browser", () => ({ createClient: () => holder.client }));

import {
  __resetThumbUrlCacheForTests,
  getCloseupUrls,
  getLiveThumbUrlCount,
} from "./thumb-url";

let objectUrlSeq = 0;
const urlShim = URL as unknown as {
  createObjectURL: (b: Blob) => string;
  revokeObjectURL: (u: string) => void;
};

function closeupRow(id: string) {
  return {
    id,
    original: null,
    main: new Blob(["closeup"], { type: "image/webp" }),
    thumb: null,
    kind: "stamp" as const,
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

test("live object-URL count stays flat across 50 day open/closes", async () => {
  const STAMPS_PER_DAY = 3; // the cap
  const OPENS = 50;

  // Every day in the test holds the max number of stamps, each with a local closeup blob.
  const ids = Array.from({ length: STAMPS_PER_DAY }, (_, i) => `img${i}`);
  await db.image_blobs.bulkPut(ids.map(closeupRow));

  expect(getLiveThumbUrlCount()).toBe(0);

  for (let i = 0; i < OPENS; i++) {
    // Open the day: useDayView acquires one handle per stamp image…
    const handles = [...(await getCloseupUrls(ids)).values()];
    expect(handles).toHaveLength(STAMPS_PER_DAY);
    expect(getLiveThumbUrlCount()).toBe(STAMPS_PER_DAY);

    // …and releases every one of them when the overlay unmounts.
    for (const h of handles) h.release();
    expect(getLiveThumbUrlCount()).toBe(0);
  }

  expect(getLiveThumbUrlCount()).toBe(0);
});
