// Pure geometry for the image pipeline (ALG-1). No canvas/DOM imports — Tier-1 unit tested.

export const MAIN_CAP = 2048; // longest edge of the stored "main" blob
export const THUMB_CAP = 256; // longest edge of the thumbnail
export const DECODE_AREA_CAP = 40_000_000; // ~40MP: above this we decode at reduced resolution

export type Dims = { width: number; height: number };

/**
 * Scale (w,h) so the longest edge is at most `cap`, preserving aspect ratio.
 * Never upscales. Returns integer dims >= 1.
 */
export function fitLongestEdge(w: number, h: number, cap: number): Dims {
  const longest = Math.max(w, h);
  if (longest <= cap) {
    return { width: Math.max(1, Math.round(w)), height: Math.max(1, Math.round(h)) };
  }
  const scale = cap / longest;
  return {
    width: Math.max(1, Math.round(w * scale)),
    height: Math.max(1, Math.round(h * scale)),
  };
}

/** Thumbnail dims: longest edge fit to THUMB_CAP. */
export function thumbDims(w: number, h: number): Dims {
  return fitLongestEdge(w, h, THUMB_CAP);
}

/**
 * Plan a quality-preserving downscale from `from` to `to` by halving each pass
 * while both dimensions stay above 2x the target, then a final exact step to `to`.
 * Returns the ordered list of dims to render at, always ending at exactly `to`.
 * A same-size or up-size request collapses to a single `[to]` pass (caller never upscales).
 */
export function planStepDown(from: Dims, to: Dims): Dims[] {
  const passes: Dims[] = [];
  let w = from.width;
  let h = from.height;
  while (w > to.width * 2 && h > to.height * 2) {
    w = Math.max(1, Math.round(w / 2));
    h = Math.max(1, Math.round(h / 2));
    passes.push({ width: w, height: h });
  }
  passes.push({ width: to.width, height: to.height });
  return passes;
}

/**
 * If the source area exceeds `areaCap`, return the reduced decode dims that bring
 * the area back under the cap (longest-edge-preserving), else null (decode full-res).
 * Used to feed createImageBitmap's resizeWidth/resizeHeight for huge inputs.
 */
export function decodeTarget(w: number, h: number, areaCap = DECODE_AREA_CAP): Dims | null {
  if (w * h <= areaCap) return null;
  const scale = Math.sqrt(areaCap / (w * h));
  return {
    width: Math.max(1, Math.floor(w * scale)),
    height: Math.max(1, Math.floor(h * scale)),
  };
}
