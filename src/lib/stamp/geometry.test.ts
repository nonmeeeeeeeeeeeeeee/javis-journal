import { expect, test } from "vitest";

import {
  bakeDims,
  clampPan,
  closeupDims,
  coverScale,
  CLOSEUP_CAP,
  fitWindow,
  minCoverScale,
  referenceSamplingWidth,
  samplingRect,
  thumbDims,
  THUMB_CAP,
  type CoverParams,
} from "./geometry";
import { MASKS } from "./masks";

const deg = (d: number) => (d * Math.PI) / 180;

// The 4 corners of the (rotated-by-θ) sampling rect in SOURCE pixels, given a pan offset.
function samplingCorners(scale: number, offX: number, offY: number, p: CoverParams) {
  const { width: ws, height: hs } = samplingRect(scale, p);
  const cx = p.imgW / 2 + offX;
  const cy = p.imgH / 2 + offY;
  const cos = Math.cos(p.rotation);
  const sin = Math.sin(p.rotation);
  const ux = cos;
  const uy = sin; // rotated x axis
  const vx = -sin;
  const vy = cos; // rotated y axis
  const hw = ws / 2;
  const hh = hs / 2;
  const corners: { x: number; y: number }[] = [];
  for (const a of [-1, 1]) {
    for (const b of [-1, 1]) {
      corners.push({
        x: cx + a * hw * ux + b * hh * vx,
        y: cy + a * hw * uy + b * hh * vy,
      });
    }
  }
  return corners;
}

function insideImage(corners: { x: number; y: number }[], p: CoverParams, eps: number): boolean {
  return corners.every(
    (c) => c.x >= -eps && c.x <= p.imgW + eps && c.y >= -eps && c.y <= p.imgH + eps,
  );
}

const IMAGES: [number, number][] = [
  [4000, 3000], // landscape
  [3000, 4000], // portrait
  [3000, 3000], // square
  [4000, 1000], // extreme wide
  [1000, 4000], // extreme tall
];
const ANGLES = [0, 15, 30, 45, 60, 75, 90, 120, 135, 180, 210, 315];

test("minCoverScale is exactly 1 at rotation 0 for every mask × image", () => {
  for (const mask of MASKS) {
    for (const [imgW, imgH] of IMAGES) {
      const s = minCoverScale({ rotation: 0, maskAspect: mask.aspect, imgW, imgH });
      expect(s).toBeCloseTo(1, 10);
    }
  }
});

test("a square mask on a square image needs √2 zoom at 45°", () => {
  const s = minCoverScale({ rotation: deg(45), maskAspect: 1, imgW: 1000, imgH: 1000 });
  expect(s).toBeCloseTo(Math.SQRT2, 10);
});

test("COVERAGE CLAMP: min-zoom keeps the rotated sampling rect fully inside the image (no gap)", () => {
  for (const mask of MASKS) {
    for (const [imgW, imgH] of IMAGES) {
      for (const a of ANGLES) {
        const p: CoverParams = { rotation: deg(a), maskAspect: mask.aspect, imgW, imgH };
        const scale = minCoverScale(p);
        // At min-cover the pan clamps to (near) centered.
        const { x, y } = clampPan({ x: 0, y: 0 }, scale, p);
        const eps = 1e-6 * Math.max(imgW, imgH);
        const corners = samplingCorners(scale, x, y, p);
        expect(
          insideImage(corners, p, eps),
          `mask=${mask.id} img=${imgW}x${imgH} angle=${a}`,
        ).toBe(true);
      }
    }
  }
});

test("min-cover is TIGHT: 1% below it, a corner escapes the image (would bake a gap)", () => {
  // Skip degenerate 0° square-in-* cases where the axis has slack; use 45° which always binds.
  for (const mask of MASKS) {
    for (const [imgW, imgH] of IMAGES) {
      const p: CoverParams = { rotation: deg(45), maskAspect: mask.aspect, imgW, imgH };
      const scale = minCoverScale(p) * 0.99;
      const corners = samplingCorners(scale, 0, 0, p);
      const eps = 1e-6 * Math.max(imgW, imgH);
      expect(insideImage(corners, p, eps)).toBe(false);
    }
  }
});

test("pan clamp keeps the rect inside even when panned hard past the edge", () => {
  for (const mask of MASKS) {
    for (const [imgW, imgH] of IMAGES) {
      for (const a of [0, 30, 45, 90]) {
        const p: CoverParams = { rotation: deg(a), maskAspect: mask.aspect, imgW, imgH };
        const scale = minCoverScale(p) * 1.5; // zoomed in → real pan freedom
        const clamped = clampPan({ x: 1e6, y: -1e6 }, scale, p);
        const eps = 1e-6 * Math.max(imgW, imgH);
        const corners = samplingCorners(scale, clamped.x, clamped.y, p);
        expect(insideImage(corners, p, eps), `mask=${mask.id} angle=${a}`).toBe(true);
      }
    }
  }
});

test("coverScale never zooms out and bumps up to min-cover under rotation", () => {
  const p: CoverParams = { rotation: deg(45), maskAspect: 1, imgW: 1000, imgH: 1000 };
  expect(coverScale(1, p)).toBeCloseTo(Math.SQRT2, 10); // bumped up
  expect(coverScale(3, p)).toBe(3); // already covers → unchanged
});

test("referenceSamplingWidth is the largest upright mask-aspect width that fits", () => {
  expect(referenceSamplingWidth(1, 4000, 3000)).toBe(3000); // height-bound
  expect(referenceSamplingWidth(2, 4000, 3000)).toBe(4000); // width-bound (2*3000=6000>4000)
});

test("fitWindow letterboxes a mask aspect into a box, preserving aspect", () => {
  const wide = fitWindow(400, 400, 2); // aspect 2 → width-bound
  expect(wide.width).toBe(400);
  expect(wide.height).toBe(200);
  const tall = fitWindow(400, 400, 0.5); // aspect 0.5 → height-bound
  expect(tall.height).toBe(400);
  expect(tall.width).toBe(200);
});

test("bake dims fit the cap on the longest edge, aspect-preserving, integer", () => {
  expect(closeupDims(1)).toEqual({ width: CLOSEUP_CAP, height: CLOSEUP_CAP });
  expect(thumbDims(1)).toEqual({ width: THUMB_CAP, height: THUMB_CAP });

  const postage = bakeDims(3 / 4, 2048); // portrait: height is the longest edge
  expect(postage.height).toBe(2048);
  expect(postage.width).toBe(Math.round(2048 * (3 / 4)));

  const cloud = bakeDims(1.4, 256); // landscape: width is the longest edge
  expect(cloud.width).toBe(256);
  expect(cloud.height).toBe(Math.round(256 / 1.4));
});
