// The punch machine's calibration (M6, decision 16). Pure math — no DOM.
//
// The machine art (`public/stamper/punch.webp`) has a GENUINE TRANSPARENT HOLE where its window
// is (verified: alpha 0 at the hole's center, in the shipped WebP). So the layers stack:
//
//     canvas (the live preview)  →  the machine art (with its hole)  →  the controls
//
// PUNCH_WINDOW locates that hole, normalized to the asset, and was MEASURED from it (a flood
// fill of the largest non-border transparent region). Re-exporting the art = re-measuring this
// one object; nothing else moves.

export type Rect = { left: number; top: number; w: number; h: number };

/** The machine art's own aspect (width / height) — it is fitted by height and centered. */
export const PUNCH_ASPECT = 926 / 1698;

/** The transparent hole, as fractions of the art's width/height. */
export const PUNCH_WINDOW: Rect = {
  left: 0.2451,
  top: 0.1425,
  w: 0.5054,
  h: 0.2662,
};

/**
 * The hole's corners are slightly rounded (the flood fill is 99.3% of its bounding box), so the
 * mask window letterboxes into a marginally inset rect — a mask corner can never be clipped by
 * the plastic.
 */
export const HOLE_INSET = 0.02;

/** The hole in machine-art pixels, given the art's on-screen size. */
export function holeRect(artW: number, artH: number): Rect {
  const w = PUNCH_WINDOW.w * artW;
  const h = PUNCH_WINDOW.h * artH;
  const ix = w * HOLE_INSET;
  const iy = h * HOLE_INSET;
  return {
    left: PUNCH_WINDOW.left * artW + ix,
    top: PUNCH_WINDOW.top * artH + iy,
    w: w - 2 * ix,
    h: h - 2 * iy,
  };
}

/**
 * Where the mask window sits on screen: the largest rect of `maskAspect` that fits inside the
 * hole, centered in it. All 4 mask aspects letterbox sanely into the ~1.04 hole (postage 3:4 is
 * height-bound, cloud 1.4 width-bound, heart/spiky 1:1 nearly fill it) — and the unit test
 * asserts the window never escapes the hole, for any aspect.
 */
export function punchWindow(artW: number, artH: number, maskAspect: number): Rect {
  const hole = holeRect(artW, artH);
  let w = hole.w;
  let h = w / maskAspect;
  if (h > hole.h) {
    h = hole.h;
    w = h * maskAspect;
  }
  return {
    left: hole.left + (hole.w - w) / 2,
    top: hole.top + (hole.h - h) / 2,
    w,
    h,
  };
}
