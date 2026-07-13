// The day's write path (M6 DoD): the first cut of a day writes the `entries` row + the `stamps`
// row ATOMICALLY; a failed bake/ingest writes NOTHING (fail-closed — no orphan entry); the 3-cap
// holds; delete is a soft-delete that Undo restores IN PLACE (the original layer_order).

import { beforeEach, describe, expect, test, vi } from "vitest";

import { db } from "@/lib/db";
import type { ImageRow } from "@/lib/db/types";

// mutations.ts imports the browser Supabase client (for setStartOfWeek's user lookup only).
vi.mock("@/lib/supabase/browser", () => ({ createClient: () => ({}) }));
// The engine's flush is scheduling, not our concern here.
vi.mock("@/lib/sync/engine", () => ({
  markDirty: vi.fn(async () => {}),
  scheduleFlush: vi.fn(),
}));

import {
  DayWriteError,
  createStampOnDay,
  deleteStamp,
  restoreStamp,
  updateStamp,
} from "./mutations";

const DATE = "2026-07-14";
const USER = "user-1";

function imageRow(id: string, width = 1024, height = 1024): ImageRow {
  return {
    id,
    user_id: USER,
    storage_path: `u/${id}.webp`,
    thumb_path: `u/${id}-t.webp`,
    width,
    height,
    mime: "image/webp",
    byte_size: 1000,
    created_at: "2026-07-14T00:00:00.000Z",
  };
}

async function outboxFor(table: string, rowId: string) {
  return db.sync_outbox.where("[table+rowId]").equals([table, rowId]).first();
}

beforeEach(async () => {
  await db.open();
  await Promise.all([
    db.entries.clear(),
    db.stamps.clear(),
    db.images.clear(),
    db.sync_outbox.clear(),
  ]);
});

describe("createStampOnDay", () => {
  test("the first cut writes the entry + the stamp atomically, both marked dirty", async () => {
    await db.images.put(imageRow("img1"));

    const stamp = await createStampOnDay(DATE, "img1", "heart");
    expect(stamp).not.toBeNull();

    const entries = await db.entries.toArray();
    expect(entries).toHaveLength(1);
    expect(entries[0].entry_date).toBe(DATE);
    expect(stamp!.entry_id).toBe(entries[0].id);
    expect(stamp!.user_id).toBe(USER);
    expect(stamp!.mask_type).toBe("heart");
    expect(stamp!.layer_order).toBe(1);

    expect(await outboxFor("entries", entries[0].id)).toBeTruthy();
    expect(await outboxFor("stamps", stamp!.id)).toBeTruthy();
  });

  test("fail-closed: an unknown image writes NOTHING (no orphan entry)", async () => {
    await expect(createStampOnDay(DATE, "missing", "heart")).rejects.toBeInstanceOf(
      DayWriteError,
    );
    expect(await db.entries.count()).toBe(0);
    expect(await db.stamps.count()).toBe(0);
    expect(await db.sync_outbox.count()).toBe(0);
  });

  test("fail-closed: an image with no dimensions writes NOTHING", async () => {
    await db.images.put({ ...imageRow("img1"), width: null, height: null });
    await expect(createStampOnDay(DATE, "img1", "heart")).rejects.toBeInstanceOf(DayWriteError);
    expect(await db.entries.count()).toBe(0);
    expect(await db.stamps.count()).toBe(0);
  });

  test("the 2nd and 3rd stamps reuse the day's entry; the 4th is rejected and writes nothing", async () => {
    for (const id of ["a", "b", "c", "d"]) await db.images.put(imageRow(id));

    const first = await createStampOnDay(DATE, "a", "heart");
    const second = await createStampOnDay(DATE, "b", "cloud");
    const third = await createStampOnDay(DATE, "c", "spiky");
    expect(second!.entry_id).toBe(first!.entry_id);
    expect(third!.entry_id).toBe(first!.entry_id);
    expect([first, second, third].map((s) => s!.layer_order)).toEqual([1, 2, 3]);

    const before = await db.stamps.count();
    const fourth = await createStampOnDay(DATE, "d", "heart");
    expect(fourth).toBeNull(); // the 3-cap
    expect(await db.stamps.count()).toBe(before);
    expect(await db.entries.count()).toBe(1);
  });

  test("deleting a stamp frees a slot (the cap counts live stamps only)", async () => {
    for (const id of ["a", "b", "c", "d"]) await db.images.put(imageRow(id));
    const a = await createStampOnDay(DATE, "a", "heart");
    await createStampOnDay(DATE, "b", "cloud");
    await createStampOnDay(DATE, "c", "spiky");

    await deleteStamp(a!.id);
    const fourth = await createStampOnDay(DATE, "d", "heart");
    expect(fourth).not.toBeNull();
  });
});

describe("updateStamp / deleteStamp / restoreStamp", () => {
  test("a gesture commit bumps updated_at and marks the stamp dirty", async () => {
    await db.images.put(imageRow("img1"));
    const stamp = await createStampOnDay(DATE, "img1", "heart");
    await db.sync_outbox.clear();

    await updateStamp(stamp!.id, { pos_x: 0.3, pos_y: 0.4, scale: 0.2, rotation_deg: 45 });

    const row = (await db.stamps.get(stamp!.id))!;
    expect(row.pos_x).toBeCloseTo(0.3);
    expect(row.rotation_deg).toBe(45);
    expect(row.updated_at >= stamp!.updated_at).toBe(true);
    expect(await outboxFor("stamps", stamp!.id)).toBeTruthy();
  });

  test("delete is a soft-delete + immediate dirty marker; the entry row survives", async () => {
    await db.images.put(imageRow("img1"));
    const stamp = await createStampOnDay(DATE, "img1", "heart");

    const layerOrder = await deleteStamp(stamp!.id);
    expect(layerOrder).toBe(stamp!.layer_order);

    const row = (await db.stamps.get(stamp!.id))!;
    expect(row.deleted_at).not.toBeNull();
    expect(await outboxFor("stamps", stamp!.id)).toBeTruthy();
    // Deleting the last stamp leaves the entries row alone (the day just renders empty).
    expect(await db.entries.count()).toBe(1);
  });

  test("undo clears the tombstone with a NEWER updated_at and restores the ORIGINAL layer_order", async () => {
    for (const id of ["a", "b", "c"]) await db.images.put(imageRow(id));
    const a = await createStampOnDay(DATE, "a", "heart"); // layer 1
    await createStampOnDay(DATE, "b", "cloud"); // layer 2
    await createStampOnDay(DATE, "c", "spiky"); // layer 3

    const layerOrder = await deleteStamp(a!.id);
    const deleted = (await db.stamps.get(a!.id))!;

    await restoreStamp(a!.id, layerOrder!);

    const row = (await db.stamps.get(a!.id))!;
    expect(row.deleted_at).toBeNull();
    expect(row.layer_order).toBe(1); // back in place — NOT to the top
    expect(row.updated_at >= deleted.updated_at).toBe(true); // wins by LWW everywhere
  });

  test("deleting an already-deleted stamp is a no-op (single-level undo can't double-fire)", async () => {
    await db.images.put(imageRow("img1"));
    const stamp = await createStampOnDay(DATE, "img1", "heart");
    await deleteStamp(stamp!.id);
    expect(await deleteStamp(stamp!.id)).toBeNull();
  });
});
