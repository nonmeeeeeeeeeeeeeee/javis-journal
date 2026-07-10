// Decode a picked file into an EXIF-baked ImageBitmap to feed the cutter. Reuses M3's HEIC
// transcode + decode-cap primitives; the bitmap is transient (discarded on confirm — ADR-M5).

import { DECODE_AREA_CAP, decodeTarget } from "@/lib/image/geometry";
import { heicToJpeg, isHeic, readMagicBytes } from "@/lib/image/heic";
import { ImagePipelineError } from "@/lib/image/process";

/** Decode `file` to an upright (EXIF-baked) ImageBitmap, capped to ~40MP for memory. */
export async function decodeForCutter(file: Blob): Promise<ImageBitmap> {
  try {
    let source: Blob = file;

    // HEIC must be transcoded on the main thread (heic2any needs the DOM); native decode is
    // used where the platform supports it (iOS/Safari).
    if (isHeic(await readMagicBytes(file))) {
      try {
        const probe = await createImageBitmap(file);
        probe.close();
      } catch {
        source = await heicToJpeg(file);
      }
    }

    let bitmap = await createImageBitmap(source, { imageOrientation: "from-image" });

    const dt = decodeTarget(bitmap.width, bitmap.height, DECODE_AREA_CAP);
    if (dt) {
      bitmap.close();
      bitmap = await createImageBitmap(source, {
        imageOrientation: "from-image",
        resizeWidth: dt.width,
        resizeHeight: dt.height,
        resizeQuality: "high",
      });
    }

    return bitmap;
  } catch (err) {
    if (err instanceof ImagePipelineError) throw err;
    throw new ImagePipelineError("Cutter decode failed", { cause: err });
  }
}
