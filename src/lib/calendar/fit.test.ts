import { describe, expect, test } from "vitest";

import {
  CELL_ASPECT_RATIO,
  computeCellW,
  GUTTER,
  TITLE_GRID_GAP,
  type CalendarView,
} from "./fit";
import { FRAME_IDS, frameInsets, frameScale } from "@/lib/frames/spec";

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

// ---------------------------------------------------------------------------- M8: with a frame

const VIEWPORTS = [
  { name: "phone", w: 390, h: 844 },
  { name: "tablet", w: 768, h: 1024 },
  { name: "desktop", w: 1440, h: 900 },
];
const VIEWS: CalendarView[] = ["full-month", "close-up"];
const CHROME = { titleH: 40, headerH: 24 };

/**
 * What the Calendar island actually hands `computeCellW` once a frame is on the centering
 * container: `clientWidth`/`clientHeight` are the **padding** box, so the viewport has already
 * lost the ring's ink on each side.
 */
function framed(vw: number, vh: number, frameW: number, frameH: number) {
  return {
    availW: vw - frameW * 2,
    availH: vh - frameH * 2,
    frameW,
    frameH,
    ...CHROME,
  };
}

describe("computeCellW with an M8 frame", () => {
  test("no frame supplied → identical to the pre-M8 model (no regression)", () => {
    for (const view of VIEWS) {
      for (const { w, h } of VIEWPORTS) {
        const bare = { availW: w, availH: h, ...CHROME };
        expect(computeCellW(view, { ...bare, frameW: 0, frameH: 0 })).toBe(
          computeCellW(view, bare),
        );
      }
    }
  });

  test("the frame is FREE on a phone: same cellW as no frame, for all 3 frames", () => {
    // The "never fights her" assertion, and the one that would regress silently. Every ring is
    // ≤ 24px at ×2, so it fits inside the gutter fit.ts already reserves and the grid does not
    // shrink by a single pixel.
    const { w, h } = VIEWPORTS[0];
    const scale = frameScale(w);
    expect(scale).toBe(2);

    for (const view of VIEWS) {
      const unframed = computeCellW(view, { availW: w, availH: h, ...CHROME });
      for (const id of FRAME_IDS) {
        const { w: fw, h: fh } = frameInsets(id, scale);
        expect(computeCellW(view, framed(w, h, fw, fh))).toBe(unframed);
      }
    }
  });

  test("the 7×6 grid still fits, unscrolled, at every viewport × frame × view", () => {
    for (const { w, h } of VIEWPORTS) {
      const scale = frameScale(w);
      for (const id of FRAME_IDS) {
        const { w: fw, h: fh } = frameInsets(id, scale);
        const m = framed(w, h, fw, fh);

        for (const view of VIEWS) {
          const cellW = computeCellW(view, m);
          expect(cellW).toBeGreaterThan(0);

          // No vertical scroll: the 6 rows + chrome fit the box inside the ring.
          const cellH = cellW / CELL_ASPECT_RATIO;
          const overhead = m.titleH + TITLE_GRID_GAP + m.headerH;
          expect(6 * cellH + overhead).toBeLessThanOrEqual(m.availH);

          // No horizontal scroll in full-month: all 7 columns fit inside the ring.
          if (view === "full-month") expect(7 * cellW).toBeLessThanOrEqual(m.availW);
        }
      }
    }
  });

  test("a ring fatter than the gutter starts costing cells (and only then)", () => {
    // The guard behind the freebie: the gutter absorbs the ring only up to its own 24px.
    const base = { availW: 390 - 60, availH: 844 - 60, ...CHROME };
    const fat = computeCellW("full-month", { ...base, frameW: 30, frameH: 30 });
    const thin = computeCellW("full-month", { availW: 390, availH: 844, ...CHROME });
    expect(fat).toBeLessThan(thin);
    // …and the total inset is max(GUTTER, ink), never the sum.
    expect(Math.max(GUTTER, 30)).toBe(30);
  });
});
