// The SINGLE cutter render path (ALG-2). Both the live preview and the bake call
// renderFrame, so what she frames is exactly what bakes — the US-6 "matches the preview"
// guarantee, now load-bearing under the destructive/baked model (ADR-M5).

import { referenceSamplingWidth, type Dims } from "./geometry";
import type { StampMask } from "./masks";

/** Live cutter transform. `scale`/`offX`/`offY`/`rotation` per the geometry.ts model. */
export type Transform = {
  /** Pan X of the sampling-rect center relative to the image center, in source px. */
  offX: number;
  /** Pan Y of the sampling-rect center relative to the image center, in source px. */
  offY: number;
  /** Zoom; 1 = min-cover at rotation 0, larger zooms in. */
  scale: number;
  /** Photo rotation in radians. */
  rotation: number;
};

/** Anything with intrinsic pixel dims that a 2D context can draw. */
export type RenderSource = ImageBitmap | HTMLCanvasElement | OffscreenCanvas;

type AnyCtx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/**
 * Draw the panned/zoomed/rotated photo behind an upright mask window into a mask-aspect canvas,
 * then cut it to the mask alpha (destination-in). `size` must match the mask aspect.
 *
 * There is no overlay pass any more: postage's perforation lives in its ALPHA (the edge is
 * bitten out), not in a white band painted on top — a white ring bled onto the journal page and
 * was the only non-photo ink in a stamp.
 */
export function renderFrame(
  ctx: AnyCtx,
  img: RenderSource,
  mask: StampMask,
  transform: Transform,
  size: Dims,
): void {
  const imgW = img.width;
  const imgH = img.height;

  const ws0 = referenceSamplingWidth(mask.aspect, imgW, imgH);
  const ws = ws0 / transform.scale; // sampling width in source px
  const cx = imgW / 2 + transform.offX; // sampling-rect center (source px)
  const cy = imgH / 2 + transform.offY;
  const k = size.width / ws; // uniform source→canvas scale (heights agree by aspect)

  ctx.clearRect(0, 0, size.width, size.height);

  // 1) The photo, mapped so the (rotated) sampling rect fills the whole canvas.
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.translate(size.width / 2, size.height / 2);
  ctx.scale(k, k);
  ctx.rotate(-transform.rotation);
  ctx.translate(-cx, -cy);
  ctx.drawImage(img, 0, 0);
  ctx.restore();

  // 2) Cut to the mask alpha. That is the whole stamp — nothing is painted on top.
  ctx.save();
  ctx.globalCompositeOperation = "destination-in";
  ctx.fill(mask.path(size.width, size.height));
  ctx.restore();
}
