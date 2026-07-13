// Hit-testing for the direct-manipulation surfaces (ALG-9). Our own math, deliberately NOT
// `elementFromPoint`: a baked heart/cloud stamp — and an alpha PNG sticker — is a RECTANGLE with
// transparent corners, so the DOM would let the top element's empty corner steal a tap from the
// element visibly underneath it. We inverse-rotate the point into each element's local frame and
// take the highest `layer_order` whose bounding box contains it — bounding-box, not alpha-
// precise: predictable, and exactly right for the 45°-snapped rectangles the editor produces.
//
// Generic over `Box` (M7) so the day page's stamps and the calendar's stickers share one
// hit-tester. Pure: no React, no Dexie, no DOM.

import type { Box, Point } from "./machine";

/** True iff `p` (surface pixels) lies inside this box's rotated rectangle. */
export function hitsBox(p: Point, box: Box): boolean {
  const rad = (box.rot * Math.PI) / 180;
  const dx = p.x - box.cx;
  const dy = p.y - box.cy;
  // Inverse-rotate into the box's local (upright) frame.
  const lx = dx * Math.cos(rad) + dy * Math.sin(rad);
  const ly = -dx * Math.sin(rad) + dy * Math.cos(rad);
  return Math.abs(lx) <= box.w / 2 && Math.abs(ly) <= box.h / 2;
}

/**
 * The element a tap lands on: the highest `layer_order` (ties on id, matching the layout
 * functions' own ordering) whose rotated box contains the point. Null on empty space
 * (→ deselect).
 */
export function topElementAt<B extends Box>(p: Point, boxes: B[]): B | null {
  let best: B | null = null;
  for (const box of boxes) {
    if (!hitsBox(p, box)) continue;
    if (best === null || box.z > best.z || (box.z === best.z && box.id > best.id)) {
      best = box;
    }
  }
  return best;
}
