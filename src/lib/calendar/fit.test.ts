import { describe, expect, test } from "vitest";

import { computeCellW, GUTTER, TITLE_GRID_GAP } from "./fit";

describe("computeCellW (fit model)", () => {
  test("phone-portrait: width is the binding dimension (close-up ~2.5 cols)", () => {
    // Tall narrow viewport → height is plentiful, width divided by 2.5 wins.
    const cellW = computeCellW("close-up", {
      availW: 400,
      availH: 900,
      titleH: 40,
      headerH: 24,
    });
    const usableW = 400 - GUTTER * 2; // 352
    expect(cellW).toBe(Math.floor(usableW / 2.5)); // 140
  });

  test("desktop-landscape: height is the binding dimension", () => {
    // Wide short viewport → the 6-row height bound wins over width/7.
    const m = { availW: 1600, availH: 700, titleH: 48, headerH: 28 };
    const usableH = m.availH - GUTTER * 2;
    const overhead = m.titleH + TITLE_GRID_GAP + m.headerH;
    const heightBoundW = Math.floor(((usableH - overhead) / 6) * (7 / 6));
    expect(computeCellW("full-month", m)).toBe(heightBoundW);
    // And it's smaller than the width-bound candidate (1600-48)/7.
    expect(heightBoundW).toBeLessThan(Math.floor((1600 - GUTTER * 2) / 7));
  });

  test("full-month divides width by 7, close-up by 2.5", () => {
    // Force width to bind in both by making height huge.
    const base = { availW: 700, availH: 5000, titleH: 40, headerH: 24 };
    expect(computeCellW("full-month", base)).toBe(Math.floor((700 - GUTTER * 2) / 7));
    expect(computeCellW("close-up", base)).toBe(Math.floor((700 - GUTTER * 2) / 2.5));
  });

  test("never negative on a tiny/degenerate viewport", () => {
    expect(computeCellW("full-month", { availW: 0, availH: 0, titleH: 40, headerH: 24 })).toBe(0);
    expect(computeCellW("close-up", { availW: 10, availH: 10, titleH: 40, headerH: 24 })).toBe(0);
  });
});
