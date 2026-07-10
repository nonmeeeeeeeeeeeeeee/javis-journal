// Destructive bake (ADR-M5): render the framed+masked photo to WebP-alpha pixels at two
// resolutions (~2048 closeup + 256 grid thumb) via the SAME render path as the preview.
// PNG-alpha fallback where convertToBlob('image/webp') is unsupported (older iOS Safari).

import { ImagePipelineError } from "@/lib/image/process";
import { closeupDims, thumbDims, type Dims } from "./geometry";
import type { StampMask } from "./masks";
import { renderFrame, type RenderSource, type Transform } from "./render";

export const WEBP_QUALITY = 0.8;

export type BakeMime = "image/webp" | "image/png";

export type BakeResult = {
  /** ~2048px longest-edge closeup (day page). */
  closeupBlob: Blob;
  /** 256px longest-edge grid thumb. */
  thumbBlob: Blob;
  /** Closeup dimensions (also the `images` row width/height). */
  width: number;
  height: number;
  mime: BakeMime;
};

/**
 * Pure format selection. Browsers that do not support WebP encoding silently emit PNG from
 * `convertToBlob('image/webp')`, so we trust the produced blob's own type rather than a
 * separate probe.
 */
export function selectBakeMime(webpAttemptType: string): BakeMime {
  return webpAttemptType === "image/webp" ? "image/webp" : "image/png";
}

type AnyCanvas = OffscreenCanvas | HTMLCanvasElement;
type AnyCtx = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

function createCanvas(w: number, h: number): AnyCanvas {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
  if (typeof document !== "undefined") {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    return c;
  }
  throw new ImagePipelineError("No canvas implementation available for the stamp bake");
}

function get2d(canvas: AnyCanvas): AnyCtx {
  const ctx = canvas.getContext("2d") as AnyCtx | null;
  if (!ctx) throw new ImagePipelineError("2d canvas context unavailable for the stamp bake");
  return ctx;
}

async function canvasToBlob(canvas: AnyCanvas, type: string, quality?: number): Promise<Blob> {
  if (typeof OffscreenCanvas !== "undefined" && canvas instanceof OffscreenCanvas) {
    return canvas.convertToBlob({ type, quality });
  }
  const el = canvas as HTMLCanvasElement;
  return new Promise<Blob>((resolve, reject) => {
    el.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new ImagePipelineError("canvas.toBlob returned null"))),
      type,
      quality,
    );
  });
}

function encode(canvas: AnyCanvas, mime: BakeMime): Promise<Blob> {
  return mime === "image/webp"
    ? canvasToBlob(canvas, "image/webp", WEBP_QUALITY)
    : canvasToBlob(canvas, "image/png");
}

function renderAt(img: RenderSource, mask: StampMask, transform: Transform, size: Dims): AnyCanvas {
  const canvas = createCanvas(size.width, size.height);
  renderFrame(get2d(canvas), img, mask, transform, size);
  return canvas;
}

/**
 * Bake the framed stamp. Fail-closed: any decode/render/encode failure throws
 * `ImagePipelineError` (ingest writes nothing).
 */
export async function bakeStamp(
  img: RenderSource,
  mask: StampMask,
  transform: Transform,
): Promise<BakeResult> {
  try {
    const closeup = closeupDims(mask.aspect);
    const thumb = thumbDims(mask.aspect);

    const closeupCanvas = renderAt(img, mask, transform, closeup);

    // Probe WebP support from the closeup's actual output type, then keep or re-encode.
    const webpAttempt = await canvasToBlob(closeupCanvas, "image/webp", WEBP_QUALITY);
    const mime = selectBakeMime(webpAttempt.type);
    const closeupBlob = mime === "image/webp" ? webpAttempt : await encode(closeupCanvas, "image/png");

    const thumbCanvas = renderAt(img, mask, transform, thumb);
    const thumbBlob = await encode(thumbCanvas, mime);

    return { closeupBlob, thumbBlob, width: closeup.width, height: closeup.height, mime };
  } catch (err) {
    if (err instanceof ImagePipelineError) throw err;
    throw new ImagePipelineError("Stamp bake failed", { cause: err });
  }
}
