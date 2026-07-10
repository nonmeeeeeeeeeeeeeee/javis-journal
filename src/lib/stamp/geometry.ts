// Pure cutter geometry (ALG-2a). No canvas / DOM imports — fully Tier-1 unit tested.
//
// Model (shared with render.ts so preview == bake):
//   - The mask window is upright with a fixed aspect A = maskAspect (w/h). The baked
//     canvas has that same aspect.
//   - The photo is drawn panned/zoomed/rotated BEHIND the window. Equivalently, a
//     "sampling rectangle" of aspect A, rotated by `rotation`, is cut out of the source
//     image and mapped onto the whole canvas.
//   - `scale` is normalized so scale === 1 is the largest UPRIGHT sampling rect that fits
//     the source at rotation 0 (min-cover at 0°); zooming in (scale > 1) shrinks the
//     sampling rect proportionally.
//   - Pan `offset` is the sampling-rect center relative to the image center, in SOURCE
//     pixels: cx = imgW/2 + offset.x, cy = imgH/2 + offset.y.
//
// Coverage invariant (no transparent corner ever bakes): the rotated sampling rect must
// stay fully inside the source image. A rotated rectangle fits inside an axis-aligned box
// iff its own axis-aligned bounding box fits — so min-zoom / pan clamps are AABB tests.

export const CLOSEUP_CAP = 2048; // longest edge of the baked closeup (day page)
export const THUMB_CAP = 256; // longest edge of the baked grid thumb

export type Dims = { width: number; height: number };
export type Vec = { x: number; y: number };

export type CoverParams = {
  /** Photo rotation in radians (continuous). */
  rotation: number;
  /** Mask window aspect ratio, width / height. */
  maskAspect: number;
  /** Source image dimensions in pixels. */
  imgW: number;
  imgH: number;
};

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * Reference sampling width Ws0 (source px): the width of the largest upright, mask-aspect
 * rectangle that fits the source at rotation 0. `scale === 1` samples exactly this width.
 */
export function referenceSamplingWidth(maskAspect: number, imgW: number, imgH: number): number {
  return Math.min(imgW, imgH * maskAspect);
}

/** The sampling rectangle (source px) at a given zoom, before rotation. */
export function samplingRect(scale: number, p: CoverParams): Dims {
  const ws0 = referenceSamplingWidth(p.maskAspect, p.imgW, p.imgH);
  const width = ws0 / scale;
  return { width, height: width / p.maskAspect };
}

/** Axis-aligned bounding box (source px) of the rotated sampling rectangle. */
export function samplingAabb(scale: number, p: CoverParams): Dims {
  const { width: ws, height: hs } = samplingRect(scale, p);
  const c = Math.abs(Math.cos(p.rotation));
  const s = Math.abs(Math.sin(p.rotation));
  return { width: ws * c + hs * s, height: ws * s + hs * c };
}

/**
 * Minimum zoom (the rotation-aware no-gap clamp): the smallest `scale` whose rotated
 * sampling rect's AABB still fits inside the source. A function of rotation angle — at 45°
 * a square mask on a square image needs ~√2 zoom. Always >= 1 at any angle for a source
 * that can hold the upright rect; returns 1 exactly at rotation 0.
 */
export function minCoverScale(p: CoverParams): number {
  const c = Math.abs(Math.cos(p.rotation));
  const s = Math.abs(Math.sin(p.rotation));
  const a = p.maskAspect;
  const ws0 = referenceSamplingWidth(a, p.imgW, p.imgH);
  // Largest sampling width WsMax(θ) satisfies both AABB-fit constraints:
  //   Ws·(c + s/a) <= imgW  and  Ws·(s + c/a) <= imgH.
  const denom = Math.max((c + s / a) / p.imgW, (s + c / a) / p.imgH);
  return ws0 * denom; // = ws0 / WsMax
}

/**
 * Bump `scale` up to the angle's min-cover when it would otherwise expose a gap (used when
 * entering / continuing rotate mode). Never zooms out.
 */
export function coverScale(scale: number, p: CoverParams): number {
  return Math.max(scale, minCoverScale(p));
}

/**
 * Clamp the pan offset (sampling-rect center, source px relative to image center) so the
 * rotated sampling rect stays inside the source. If `scale` is below min-cover the rect is
 * larger than the image on an axis; that axis clamps to 0 (centered) rather than going NaN.
 */
export function clampPan(offset: Vec, scale: number, p: CoverParams): Vec {
  const aabb = samplingAabb(scale, p);
  const maxX = Math.max(0, (p.imgW - aabb.width) / 2);
  const maxY = Math.max(0, (p.imgH - aabb.height) / 2);
  return {
    x: clamp(offset.x, -maxX, maxX),
    y: clamp(offset.y, -maxY, maxY),
  };
}

/**
 * Largest rectangle of aspect A that fits inside `maxW × maxH` (letterbox the mask window
 * into the available screen box). Returns floats for CSS layout.
 */
export function fitWindow(maxW: number, maxH: number, maskAspect: number): Dims {
  let width = maxW;
  let height = maxW / maskAspect;
  if (height > maxH) {
    height = maxH;
    width = maxH * maskAspect;
  }
  return { width, height };
}

/** Baked dims for a mask aspect at a longest-edge cap. Integer, >= 1, aspect-preserving. */
export function bakeDims(maskAspect: number, cap: number): Dims {
  let width: number;
  let height: number;
  if (maskAspect >= 1) {
    width = cap;
    height = Math.round(cap / maskAspect);
  } else {
    height = cap;
    width = Math.round(cap * maskAspect);
  }
  return { width: Math.max(1, width), height: Math.max(1, height) };
}

export function closeupDims(maskAspect: number): Dims {
  return bakeDims(maskAspect, CLOSEUP_CAP);
}

export function thumbDims(maskAspect: number): Dims {
  return bakeDims(maskAspect, THUMB_CAP);
}
