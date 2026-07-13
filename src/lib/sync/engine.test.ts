import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { db } from "../db";
import type { Entry, Stamp } from "../db/types";
import { createMockSupabase } from "./test-utils";
import { getPending, markDirty as outboxMarkDirty } from "./outbox";
import { flush } from "./push";
import { pullLWW } from "./pull";
import {
  __getBackoffForTests,
  __resetEngineForTests,
  flushNow,
  scheduleFlush,
} from "./engine";
import { getSyncStatus } from "./status";

// The push/pull engines call createClient() fresh each cycle; redirect it to a mock whose
// backing store and control helpers the tests drive. `holder` is hoisted so the mock factory
// can close over it before module imports run; beforeEach swaps in a fresh client per test.
const holder = vi.hoisted(() => ({ client: null as unknown }));

vi.mock("@/lib/supabase/browser", () => ({
  createClient: () => holder.client,
}));

type MockControl = ReturnType<typeof createMockSupabase>;

let ctl: MockControl;

const ME = "mock-user-id";

function makeEntry(id: string, updated_at: string, entry_date = "2026-07-08"): Entry {
  return {
    id,
    user_id: ME,
    entry_date,
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at,
  };
}

function makeStamp(
  id: string,
  updated_at: string,
  deleted_at: string | null,
): Stamp {
  return {
    id,
    entry_id: "e1",
    user_id: ME,
    image_id: "img1",
    mask_type: "circle",
    pos_x: 0,
    pos_y: 0,
    scale: 1,
    rotation_deg: 0,
    layer_order: 0,
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at,
    deleted_at,
  };
}

beforeEach(async () => {
  ctl = createMockSupabase();
  holder.client = ctl.client;
  __resetEngineForTests();

  await db.open();
  await Promise.all([
    db.entries.clear(),
    db.stamps.clear(),
    db.placed_stickers.clear(),
    db.profiles.clear(),
    db.images.clear(),
    db.sticker_assets.clear(),
    db.sync_outbox.clear(),
    db.sync_meta.clear(),
  ]);
});

afterEach(() => {
  __resetEngineForTests();
  vi.useRealTimers();
});

test("optimistic write is flushed after the debounce and clears the outbox", async () => {
  // Real timers here: fake timers stall fake-indexeddb, which flush() reads from.
  const entry = makeEntry("e1", "2026-07-08T00:00:00.000Z");
  await db.entries.put(entry);
  await outboxMarkDirty("entries", "e1", "upsert");
  expect(await getPending("entries")).toHaveLength(1);

  scheduleFlush(); // arms the real 800ms debounce timer -> flushNow

  await vi.waitFor(
    async () => {
      expect(await getPending("entries")).toHaveLength(0);
    },
    { timeout: 3000, interval: 50 },
  );
  expect(ctl.store.get("entries")).toEqual([entry]);
});

test("pull applies remote-newer rows and keeps locally-dirty newer rows", async () => {
  const T1 = "2026-07-01T00:00:00.000Z";
  const T3 = "2026-07-03T00:00:00.000Z";
  const T5 = "2026-07-05T00:00:00.000Z";

  // Local e1 is dirty and newer than the remote copy -> keep local.
  await db.entries.put(makeEntry("e1", T3));
  await outboxMarkDirty("entries", "e1", "upsert");
  // Local e3 is older and clean -> remote should win.
  await db.entries.put(makeEntry("e3", T1));

  ctl.store.set("entries", [
    makeEntry("e1", T1),
    makeEntry("e2", T3),
    makeEntry("e3", T5),
  ]);

  await pullLWW("entries");

  expect((await db.entries.get("e1"))?.updated_at).toBe(T3);
  expect(await db.entries.get("e2")).toBeTruthy();
  expect((await db.entries.get("e3"))?.updated_at).toBe(T5);
});

test("equal-timestamp rows resolve deterministically, retaining the local row", async () => {
  const T = "2026-07-04T00:00:00.000Z";
  await db.entries.put(makeEntry("e1", T, "2026-07-04"));
  ctl.store.set("entries", [makeEntry("e1", T, "1999-01-01")]);

  await pullLWW("entries");

  // Equal updated_at + equal id => remote does not win, local is kept.
  expect((await db.entries.get("e1"))?.entry_date).toBe("2026-07-04");
});

test("a tombstone deletes the local row and never resurrects a missing one", async () => {
  const T1 = "2026-07-01T00:00:00.000Z";
  const T2 = "2026-07-02T00:00:00.000Z";

  await db.stamps.put(makeStamp("s1", T1, null));
  ctl.store.set("stamps", [
    makeStamp("s1", T2, T2), // newer + deleted -> delete local
    makeStamp("s2", T2, T2), // deleted, no local -> stay absent
  ]);

  await pullLWW("stamps");

  expect(await db.stamps.get("s1")).toBeUndefined();
  expect(await db.stamps.get("s2")).toBeUndefined();
});

test("push backs off exponentially on repeated network failure", async () => {
  // A down network throws at getUser (before any DB read), so fake timers are safe here.
  ctl.setNetworkDown(true);
  vi.useFakeTimers();

  await flushNow(); // attempt 1
  expect(ctl.getAuthCallCount()).toBe(1);
  expect(getSyncStatus()).toBe("offline");

  await vi.advanceTimersByTimeAsync(2000); // attempt 2 fires after 2s
  expect(ctl.getAuthCallCount()).toBe(2);
  await vi.advanceTimersByTimeAsync(4000); // 4s
  expect(ctl.getAuthCallCount()).toBe(3);
  await vi.advanceTimersByTimeAsync(8000); // 8s
  expect(ctl.getAuthCallCount()).toBe(4);
  await vi.advanceTimersByTimeAsync(16000); // 16s
  expect(ctl.getAuthCallCount()).toBe(5);

  // Advancing less than the next (32s) delay must NOT trigger another attempt.
  await vi.advanceTimersByTimeAsync(31999);
  expect(ctl.getAuthCallCount()).toBe(5);

  vi.useRealTimers();
  __resetEngineForTests(); // stop the pending retry
});

test("a successful flush resets the backoff", async () => {
  // Grow the backoff with failing attempts (no DB access while the network is down).
  ctl.setNetworkDown(true);
  vi.useFakeTimers();
  await flushNow(); // backoff 2s -> 4s
  await vi.advanceTimersByTimeAsync(2000); // -> 8s
  expect(__getBackoffForTests().flush).toBe(8000);
  vi.useRealTimers(); // discards the pending fake retry

  // Recover and flush for real (real timers so fake-indexeddb works) -> backoff resets.
  ctl.setNetworkDown(false);
  await flushNow();
  expect(getSyncStatus()).toBe("idle");
  expect(__getBackoffForTests().flush).toBe(2000);
});

test("a poison-pill row is quarantined while the rest of the table still syncs", async () => {
  await db.entries.put(makeEntry("good", "2026-07-08T00:00:00.000Z"));
  await db.entries.put(makeEntry("bad", "2026-07-08T00:00:00.000Z"));
  await outboxMarkDirty("entries", "good", "upsert");
  await outboxMarkDirty("entries", "bad", "upsert");
  ctl.failRow("entries", "bad", "constraint violation");

  const result = await flush();
  expect(result).toEqual({ ok: true, pushed: 1, quarantined: 1 });

  // The good row synced and cleared; the bad row is quarantined (excluded from pending).
  expect(await getPending("entries")).toHaveLength(0);

  const badOutbox = await db.sync_outbox
    .where("[table+rowId]")
    .equals(["entries", "bad"])
    .first();
  expect(badOutbox?.quarantined).toBe(true);
  expect(badOutbox?.lastError).toContain("constraint violation");

  const goodOutbox = await db.sync_outbox
    .where("[table+rowId]")
    .equals(["entries", "good"])
    .first();
  expect(goodOutbox).toBeUndefined();

  expect(ctl.store.get("entries")?.map((row) => row.id)).toEqual(["good"]);
});
