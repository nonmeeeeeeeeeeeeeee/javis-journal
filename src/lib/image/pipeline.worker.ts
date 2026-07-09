// Web Worker wrapper around the pure pipeline core. Instantiated by host.ts via
// `new Worker(new URL('./pipeline.worker.ts', import.meta.url), { type: 'module' })`
// — Turbopack resolves this form natively (no loader shim).
/// <reference lib="webworker" />

import { ImagePipelineError, processBitmap, type ProcessKind } from "./process";

type RequestMsg = { id: number; file: Blob; kind: ProcessKind };
type ResponseMsg =
  | { id: number; ok: true; mainBlob: Blob; thumbBlob: Blob; width: number; height: number }
  | { id: number; ok: false; error: string };

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.addEventListener("message", async (ev: MessageEvent<RequestMsg>) => {
  const { id, file, kind } = ev.data;
  try {
    const res = await processBitmap(file, kind);
    const msg: ResponseMsg = {
      id,
      ok: true,
      mainBlob: res.mainBlob,
      thumbBlob: res.thumbBlob,
      width: res.width,
      height: res.height,
    };
    ctx.postMessage(msg);
  } catch (err) {
    const error = err instanceof ImagePipelineError ? err.message : String(err);
    const msg: ResponseMsg = { id, ok: false, error };
    ctx.postMessage(msg);
  }
});
