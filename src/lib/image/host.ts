// Public pipeline entry. Runs processBitmap in a Web Worker (OffscreenCanvas) when
// available, falling back to the main thread when a worker/OffscreenCanvas is absent.

import { heicToJpeg, isHeic, readMagicBytes } from "./heic";
import {
  ImagePipelineError,
  processBitmap,
  type ProcessKind,
  type ProcessResult,
} from "./process";

type ResponseMsg =
  | { id: number; ok: true; mainBlob: Blob; thumbBlob: Blob; width: number; height: number }
  | { id: number; ok: false; error: string };

let workerSupported: boolean | null = null;
let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, { resolve: (r: ProcessResult) => void; reject: (e: unknown) => void }>();

function supportsWorkerOffscreen(): boolean {
  return (
    typeof Worker !== "undefined" &&
    typeof OffscreenCanvas !== "undefined" &&
    typeof createImageBitmap !== "undefined"
  );
}

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL("./pipeline.worker.ts", import.meta.url), { type: "module" });
  worker.addEventListener("message", (ev: MessageEvent<ResponseMsg>) => {
    const data = ev.data;
    const entry = pending.get(data.id);
    if (!entry) return;
    pending.delete(data.id);
    if (data.ok) {
      entry.resolve({
        mainBlob: data.mainBlob,
        thumbBlob: data.thumbBlob,
        width: data.width,
        height: data.height,
      });
    } else {
      entry.reject(new ImagePipelineError(data.error));
    }
  });
  worker.addEventListener("error", (ev) => {
    // Worker infrastructure failure: reject everything in flight so callers can
    // retry on the main thread.
    const err = new Error(`pipeline worker error: ${ev.message}`);
    for (const entry of pending.values()) entry.reject(err);
    pending.clear();
    worker?.terminate();
    worker = null;
  });
  return worker;
}

function runInWorker(file: Blob, kind: ProcessKind): Promise<ProcessResult> {
  const w = getWorker();
  const id = ++seq;
  return new Promise<ProcessResult>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    w.postMessage({ id, file, kind });
  });
}

/**
 * Process a picked file into main + thumb blobs. Prefers the worker; on worker
 * infrastructure failure (not a genuine ImagePipelineError) it disables the worker
 * and re-runs on the main thread.
 */
export async function processImage(file: Blob, kind: ProcessKind): Promise<ProcessResult> {
  // HEIC transcode must run on the main thread (heic2any uses the DOM and throws in a
  // worker), so it happens here before we hand a decodable blob to the worker.
  const decodable = await ensureDecodable(file);

  if (workerSupported === null) workerSupported = supportsWorkerOffscreen();

  if (workerSupported) {
    try {
      return await runInWorker(decodable, kind);
    } catch (err) {
      if (err instanceof ImagePipelineError) throw err; // real pipeline failure — do not mask
      workerSupported = false; // infra failure — degrade to main thread for this and future calls
    }
  }

  return processBitmap(decodable, kind);
}

/**
 * Return a natively-decodable blob. Non-HEIC inputs pass through. HEIC is decoded
 * natively when the platform supports it (iOS/Safari); otherwise it is transcoded to
 * JPEG via heic2any on the main thread (Android Chrome has no native HEIC decode).
 */
async function ensureDecodable(file: Blob): Promise<Blob> {
  if (!isHeic(await readMagicBytes(file))) return file;

  try {
    const probe = await createImageBitmap(file);
    probe.close();
    return file; // native HEIC decode works here (and in the worker)
  } catch {
    // fall through to transcode
  }

  try {
    return await heicToJpeg(file);
  } catch (err) {
    throw new ImagePipelineError("HEIC transcode failed", { cause: err });
  }
}
