// The sticker layer's composition (M7 DoD, Tier 1):
//   · a sticker is in the SAME PLACE relative to the grid in both views — that is the whole
//     reason the coordinates are normalized to the day-grid box and not to the viewport
//   · the layer draws back-to-front, deterministically
//   · a tap resolves to the day underneath it in either view's flow (isolation case 4)

import { describe, expect, test } from "vitest";

import type { PlacedSticker } from "@/lib/db/types";
import { topElementAt } from "@/lib/gestures/hit";
import { dateAtGridPoint } from "./cell";
import { gridHeight, stickerBoxes } from "./layout";

const ASPECTS = new Map([["img1", 1]]);

function sticker(over: Partial<PlacedSticker> = {}): PlacedSticker {
  return {
    id: "s1",
    user_id: "u1",
    image_id: "img1",
    sticker_asset_id: "a1",
    year_month: "2026-07",
    pos_x: 0.5,
    pos_y: 0.5,
    scale: 0.14,
    rotation_deg: 0,
    layer_order: 1,
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-01T00:00:00.000Z",
    deleted_at: null,
    ...over,
  };
}

describe("stickerBoxes", () => {
  test("the same sticker sits in the same relative place at any grid size (the view switch)", () => {
    const s = [sticker({ pos_x: 0.3, pos_y: 0.7, scale: 0.2 })];

    // Close-up cells are much wider than full-month cells — this is that difference.
    const closeUp = stickerBoxes(s, ASPECTS, 1400)[0];
    const fullMonth = stickerBoxes(s, ASPECTS, 350)[0];

    expect(closeUp.cx / 1400).toBeCloseTo(fullMonth.cx / 350, 10);
    expect(closeUp.cy / gridHeight(1400)).toBeCloseTo(fullMonth.cy / gridHeight(350), 10);
    expect(closeUp.w / 1400).toBeCloseTo(fullMonth.w / 350, 10);
  });

  test("it draws live stickers back-to-front, and drops tombstoned ones", () => {
    const boxes = stickerBoxes(
      [
        sticker({ id: "top", layer_order: 5 }),
        sticker({ id: "gone", layer_order: 6, deleted_at: "2026-07-02" }),
        sticker({ id: "bottom", layer_order: 1 }),
      ],
      ASPECTS,
      700,
    );
    expect(boxes.map((b) => b.id)).toEqual(["bottom", "top"]);
  });

  test("a tap picks the FRONT-MOST sticker under it, not whichever the DOM would hand over", () => {
    const boxes = stickerBoxes(
      [
        sticker({ id: "under", layer_order: 1 }),
        sticker({ id: "over", layer_order: 2 }),
      ],
      ASPECTS,
      700,
    );
    const center = { x: 0.5 * 700, y: 0.5 * gridHeight(700) };
    expect(topElementAt(center, boxes)?.id).toBe("over");
  });
});

describe("dateAtGridPoint — an unselected sticker hands its tap back to the day", () => {
  const GRID_W = 700;
  const CELL_W = GRID_W / 7;
  const CELL_H = gridHeight(GRID_W) / 6;

  // July 2026 starts on a Wednesday, so with a Monday week-start the first cell of the grid is
  // the 3rd column of row 1.
  const center = (col: number, row: number) => ({
    x: (col + 0.5) * CELL_W,
    y: (row + 0.5) * CELL_H,
  });

  test("the day at a (column, row) is the day drawn there — in EITHER view", () => {
    // July 2026 starts on a Wednesday, so with a Monday week-start the 1st is the 3rd column.
    // Close-up flows column-major and full-month row-major, but `toColumnMajor` preserves visual
    // columns, so one mapping serves both — which is the same reason a sticker keeps its place
    // across a view switch.
    expect(dateAtGridPoint(center(2, 0), GRID_W, 2026, 7, 1)).toBe("2026-07-01");
    expect(dateAtGridPoint(center(3, 0), GRID_W, 2026, 7, 1)).toBe("2026-07-02");
    expect(dateAtGridPoint(center(2, 1), GRID_W, 2026, 7, 1)).toBe("2026-07-08");
  });

  test("the week-start moves the days under the layer with it", () => {
    // Sunday-start shifts July 1st one column right.
    expect(dateAtGridPoint(center(3, 0), GRID_W, 2026, 7, 7)).toBe("2026-07-01");
  });

  test("a leading pad cell is not a day, and neither is a point off the grid", () => {
    expect(dateAtGridPoint(center(0, 0), GRID_W, 2026, 7, 1)).toBeNull();
    expect(dateAtGridPoint({ x: -5, y: 10 }, GRID_W, 2026, 7, 1)).toBeNull();
    expect(dateAtGridPoint({ x: GRID_W + 5, y: 10 }, GRID_W, 2026, 7, 1)).toBeNull();
  });
});
