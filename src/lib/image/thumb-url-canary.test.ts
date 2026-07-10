// Object-URL canary (ALG-6 / M4 DoD). The single biggest reliability risk in M4 is
// object-URL leakage across month navigations. `useMonthData` acquires a month's
// thumb handles via getThumbUrls and releases them all on unmount / stamp-set change.
// This test exercises that exact acquire→release cycle at the registry level (no React
// runtime available in the node env) and asserts the live-URL count returns to
// baseline every month and never grows across N navigations.

import { beforeEach, afterEach, expect, test, vi } from "vitest";

import { db } from "@/lib/db";
import { createMockSupabase } from "@/lib/sync/test-utils";

const holder = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/lib/supabase/browser", () => ({ createClient: () => holder.client }));

import {
  __resetThumbUrlCacheForTests,
  getLiveThumbUrlCount,
  getThumbUrls,
  type ThumbHandle,
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
    thumb: new Blob(["thumb"], { type: "image/jpeg" }),
    kind: "photo" as const,
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

test("live object-URL count stays flat across many month navigations", async () => {
  const DAYS_PER_MONTH = 20;
  const MONTHS = 24;

  expect(getLiveThumbUrlCount()).toBe(0);

  let previous: ThumbHandle[] = [];

  for (let m = 0; m < MONTHS; m++) {
    // Each month has its own image ids + local thumb blobs.
    const ids = Array.from({ length: DAYS_PER_MONTH }, (_, d) => `m${m}-img${d}`);
    await db.image_blobs.bulkPut(ids.map(thumbRow));

    // Acquire this month's handles (what useMonthData does on mount/month-change)…
    const handles = [...(await getThumbUrls(ids)).values()];
    // …exactly one live URL per unique local thumb, on top of the previous month
    // which hasn't been released yet (mirrors the brief overlap during a switch).
    expect(getLiveThumbUrlCount()).toBe(DAYS_PER_MONTH + previous.length);

    // Release the outgoing month (the load-bearing release-on-unmount).
    for (const h of previous) h.release();
    expect(getLiveThumbUrlCount()).toBe(DAYS_PER_MONTH);

    previous = handles;
  }

  // Unmount the last month: count returns all the way to baseline.
  for (const h of previous) h.release();
  expect(getLiveThumbUrlCount()).toBe(0);
});
