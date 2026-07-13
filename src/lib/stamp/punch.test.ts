import { describe, expect, test } from "vitest";

import { MASKS } from "./masks";
import { PUNCH_ASPECT, PUNCH_WINDOW, holeRect, punchWindow } from "./punch";

// The machine's calibration is one constant measured off the asset. This is the test that
// catches a re-export: if PUNCH_WINDOW ever drifts from the real hole, the mask window escapes
// it and the preview draws over the plastic.

const SIZES = [
  { w: 400, h: 400 / PUNCH_ASPECT },
  { w: 926, h: 1698 },
  { w: 220, h: 220 / PUNCH_ASPECT },
];

describe("punchWindow", () => {
  test("the mask window never escapes the hole — for all 4 shipped masks, at any art size", () => {
    for (const { w, h } of SIZES) {
      const hole = holeRect(w, h);
      for (const mask of MASKS) {
        const win = punchWindow(w, h, mask.aspect);
        const eps = 1e-9;
        expect(win.left).toBeGreaterThanOrEqual(hole.left - eps);
        expect(win.top).toBeGreaterThanOrEqual(hole.top - eps);
        expect(win.left + win.w).toBeLessThanOrEqual(hole.left + hole.w + eps);
        expect(win.top + win.h).toBeLessThanOrEqual(hole.top + hole.h + eps);
        expect(win.w).toBeGreaterThan(0);
        expect(win.h).toBeGreaterThan(0);
      }
    }
  });

  test("the window keeps the mask's aspect exactly (the preview is never squashed)", () => {
    for (const mask of MASKS) {
      const win = punchWindow(926, 1698, mask.aspect);
      expect(win.w / win.h).toBeCloseTo(mask.aspect, 9);
    }
  });

  test("it letterboxes: each mask is bound by the hole's tighter axis and stays centered", () => {
    const w = 926;
    const h = 1698;
    const hole = holeRect(w, h);
    const holeAspect = hole.w / hole.h;
    for (const mask of MASKS) {
      const win = punchWindow(w, h, mask.aspect);
      // The window fills the hole on exactly the binding axis…
      if (mask.aspect >= holeAspect) expect(win.w).toBeCloseTo(hole.w, 6);
      else expect(win.h).toBeCloseTo(hole.h, 6);
      // …and is centered in it on the other.
      expect(win.left + win.w / 2).toBeCloseTo(hole.left + hole.w / 2, 6);
      expect(win.top + win.h / 2).toBeCloseTo(hole.top + hole.h / 2, 6);
    }
  });

  test("the hole is a plausible near-square in the upper half of the machine", () => {
    // Cheap sanity net around the measured constant itself.
    const aspect = (PUNCH_WINDOW.w * 926) / (PUNCH_WINDOW.h * 1698);
    expect(aspect).toBeGreaterThan(0.9);
    expect(aspect).toBeLessThan(1.2);
    expect(PUNCH_WINDOW.top + PUNCH_WINDOW.h).toBeLessThan(0.5);
  });
});
