import { describe, expect, test } from "vitest";

import type { Stamp } from "@/lib/db/types";
import { pickTopStamp } from "./queries";

function stamp(over: Partial<Stamp>): Stamp {
  return {
    id: "s1",
    entry_id: "e1",
    user_id: "u1",
    image_id: "img1",
    mask_type: "circle",
    crop_offset_x: 0,
    crop_offset_y: 0,
    crop_scale: 1,
    pos_x: 0,
    pos_y: 0,
    scale: 1,
    rotation_deg: 0,
    layer_order: 0,
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-01T00:00:00.000Z",
    deleted_at: null,
    ...over,
  };
}

describe("pickTopStamp", () => {
  test("picks the max layer_order among live stamps", () => {
    const top = pickTopStamp([
      stamp({ id: "a", layer_order: 0 }),
      stamp({ id: "b", layer_order: 2 }),
      stamp({ id: "c", layer_order: 1 }),
    ]);
    expect(top?.id).toBe("b");
  });

  test("ignores tombstoned (deleted_at != null) stamps", () => {
    const top = pickTopStamp([
      stamp({ id: "a", layer_order: 5, deleted_at: "2026-07-02T00:00:00.000Z" }),
      stamp({ id: "b", layer_order: 1 }),
    ]);
    expect(top?.id).toBe("b");
  });

  test("breaks layer_order ties deterministically on id", () => {
    const top = pickTopStamp([
      stamp({ id: "aaa", layer_order: 3 }),
      stamp({ id: "zzz", layer_order: 3 }),
    ]);
    expect(top?.id).toBe("zzz");
  });

  test("empty / all-deleted → null (no thumb)", () => {
    expect(pickTopStamp([])).toBeNull();
    expect(
      pickTopStamp([stamp({ deleted_at: "2026-07-02T00:00:00.000Z" })]),
    ).toBeNull();
  });
});
