// Hit-testing for the day page (ALG-9). Our own math, deliberately NOT `elementFromPoint`:
// a baked heart/cloud stamp is a RECTANGLE with transparent corners, so the DOM would let the
// top stamp's empty corner steal a tap from the stamp visibly underneath it. We inverse-rotate
// the point into each stamp's local frame and take the highest `layer_order` whose bounding box
// contains it — bounding-box, not alpha-precise: predictable, and exactly right for the
// 45°-snapped rectangles the editor produces.
//
// Pure: no React, no Dexie, no DOM.

import type { StampBox } from "./layout";
import type { Point } from "./place";

/** True iff `p` (page pixels) lies inside this box's rotated rectangle. */
export function hitsBox(p: Point, box: StampBox): boolean {
  const rad = (box.rot * Math.PI) / 180;
  const dx = p.x - box.cx;
  const dy = p.y - box.cy;
  // Inverse-rotate into the box's local (upright) frame.
  const lx = dx * Math.cos(rad) + dy * Math.sin(rad);
  const ly = -dx * Math.sin(rad) + dy * Math.cos(rad);
  return Math.abs(lx) <= box.w / 2 && Math.abs(ly) <= box.h / 2;
}

/**
 * The stamp a tap lands on: the highest `layer_order` (ties on id, matching `stampBoxes`' own
 * ordering) whose rotated box contains the point. Null on empty page space (→ deselect).
 */
export function topElementAt(p: Point, boxes: StampBox[]): StampBox | null {
  let best: StampBox | null = null;
  for (const box of boxes) {
    if (!hitsBox(p, box)) continue;
    if (best === null || box.z > best.z || (box.z === best.z && box.id > best.id)) {
      best = box;
    }
  }
  return best;
}
