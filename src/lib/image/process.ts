// ALG-1 pipeline core: a picked File/Blob -> { mainBlob, thumbBlob, width, height }.
// Pure async fn callable from both the worker wrapper and vitest. Runs on any thread
// that has createImageBitmap + a canvas (OffscreenCanvas in workers/modern main
// threads, HTMLCanvasElement as the main-thread fallback).

import {
  DECODE_AREA_CAP,
  MAIN_CAP,
  decodeTarget,
  fitLongestEdge,
  planStepDown,
  thumbDims,
  type Dims,
} from "./geometry";
export type ProcessKind = "photo" | "sticker";

export type ProcessResult = {
  mainBlob: Blob;
  thumbBlob: Blob;
  width: number;
  height: number;
};

/** Thrown for any decode/transcode/encode failure so ingest can fail-closed. */
export class ImagePipelineError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ImagePipelineError";
  }
}

type AnyCanvas = OffscreenCanvas | HTMLCanvasElement;
type AnyCtx = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

function createCanvas(w: number, h: number): AnyCanvas {
  if (typeof OffscreenCanvas !== "undefined") {
    return new OffscreenCanvas(w, h);
  }
  if (typeof document !== "undefined") {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    return c;
  }
  throw new ImagePipelineError("No canvas implementation available in this environment");
}

function get2d(canvas: AnyCanvas): AnyCtx {
  const ctx = canvas.getContext("2d") as AnyCtx | null;
  if (!ctx) throw new ImagePipelineError("2d canvas context unavailable");
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

/** Quality-preserving stepped-halving downscale of `bitmap` to `target`, then encode. */
async function renderTo(
  bitmap: ImageBitmap,
  target: Dims,
  type: string,
  quality: number | undefined,
): Promise<Blob> {
  const passes = planStepDown({ width: bitmap.width, height: bitmap.height }, target);
  let src: CanvasImageSource = bitmap;
  let sw = bitmap.width;
  let sh = bitmap.height;
  let canvas: AnyCanvas | null = null;

  for (const dims of passes) {
    canvas = createCanvas(dims.width, dims.height);
    const ctx = get2d(canvas);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(src, 0, 0, sw, sh, 0, 0, dims.width, dims.height);
    src = canvas;
    sw = dims.width;
    sh = dims.height;
  }

  if (!canvas) throw new ImagePipelineError("downscale produced no render pass");
  return canvasToBlob(canvas, type, quality);
}

/**
 * How a 256px thumb is encoded. **A thumb must carry the same alpha its main does.** A sticker
 * is a transparent PNG and the sticker layer renders from THUMBS (M7), so a JPEG thumb — JPEG
 * has no alpha channel — composites every transparent pixel to **black**, which is exactly the
 * bug this exists to prevent. A photo has no alpha to lose and PNG would balloon it, so it keeps
 * JPEG q0.7.
 */
export function thumbEncoding(kind: ProcessKind): { type: string; quality?: number } {
  return kind === "sticker"
    ? { type: "image/png" }
    : { type: "image/jpeg", quality: 0.7 };
}

/**
 * Decode `source` with EXIF orientation baked (imageOrientation: "from-image"),
 * apply the huge-input decode cap, then produce a ~2048px main blob
 * (JPEG q0.8 for photos, PNG for stickers) and a 256px JPEG thumb.
 */
export async function processBitmap(source: Blob, kind: ProcessKind): Promise<ProcessResult> {
  try {
    // `source` is already natively decodable: HEIC is transcoded on the main thread
    // (host.ensureDecodable) before we get here, because heic2any needs the DOM and
    // throws inside a Web Worker.
    let bitmap = await createImageBitmap(source, { imageOrientation: "from-image" });
    let srcW = bitmap.width;
    let srcH = bitmap.height;

    // Huge-input decode cap: re-decode at reduced resolution to bound peak memory.
    const dt = decodeTarget(srcW, srcH, DECODE_AREA_CAP);
    if (dt) {
      bitmap.close();
      bitmap = await createImageBitmap(source, {
        imageOrientation: "from-image",
        resizeWidth: dt.width,
        resizeHeight: dt.height,
        resizeQuality: "high",
      });
      srcW = bitmap.width;
      srcH = bitmap.height;
    }

    const mainType = kind === "sticker" ? "image/png" : "image/jpeg";
    const mainQuality = kind === "sticker" ? undefined : 0.8;
    const mainDims = fitLongestEdge(srcW, srcH, MAIN_CAP);
    const mainBlob = await renderTo(bitmap, mainDims, mainType, mainQuality);

    const tDims = thumbDims(srcW, srcH);
    const thumb = thumbEncoding(kind);
    const thumbBlob = await renderTo(bitmap, tDims, thumb.type, thumb.quality);

    bitmap.close();
    return { mainBlob, thumbBlob, width: mainDims.width, height: mainDims.height };
  } catch (err) {
    if (err instanceof ImagePipelineError) throw err;
    throw new ImagePipelineError("Image processing failed", { cause: err });
  }
}
