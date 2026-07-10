"use client";

// The stamper / cutter machine (US-6). A controlled component: pick a File, frame it behind
// one of the 4 masks (pan / zoom / rotate-mode), then Cut → bake (WebP-alpha) → ingest →
// onConfirm(image_id). Clean pastel-token chrome; the skeuomorphic machine art + the cut
// animation/sound are M10 (US-14) — this leaves a seam, never blocks the cut on a flourish.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ImagePipelineError } from "@/lib/image/process";
import { bakeStamp } from "@/lib/stamp/bake";
import { decodeForCutter } from "@/lib/stamp/decode";
import { fitWindow } from "@/lib/stamp/geometry";
import { CutterController, type CutterState } from "@/lib/stamp/gestures";
import { ingestStamp } from "@/lib/stamp/ingest-stamp";
import { MASKS } from "@/lib/stamp/masks";
import { renderFrame } from "@/lib/stamp/render";

export type StamperProps = {
  /** The picked photo (transient — decoded to frame, discarded on confirm). */
  file: File;
  /** Called with the baked stamp's image id after a successful Cut. */
  onConfirm: (imageId: string) => void;
  /** Called when the user backs out without cutting. */
  onCancel: () => void;
};

type Phase = "decoding" | "ready" | "error";

const MAX_DPR = 2; // cap the preview backing store for perf on high-DPR phones

function localPoint(e: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } {
  const rect = e.currentTarget.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

export function Stamper({ file, onConfirm, onCancel }: StamperProps) {
  const [maskIndex, setMaskIndex] = useState(0);
  const [transform, setTransform] = useState<CutterState>({
    offX: 0,
    offY: 0,
    scale: 1,
    rotation: 0,
    mode: "pan",
  });
  const [stage, setStage] = useState({ w: 0, h: 0 });
  const [phase, setPhase] = useState<Phase>("decoding");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bitmapRef = useRef<ImageBitmap | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);

  // Controller (created once, stable). onChange mirrors the live transform into React state.
  const [controller] = useState(() => new CutterController(setTransform));

  const mask = MASKS[maskIndex];
  const windowDims = useMemo(
    () => fitWindow(stage.w, stage.h, mask.aspect),
    [stage.w, stage.h, mask.aspect],
  );

  // Decode the picked file → EXIF-baked bitmap, then seed the controller. The component is
  // mounted fresh per session (keyed by file upstream), so initial phase "decoding" holds
  // until this resolves; the async handlers own all state transitions (no sync setState).
  useEffect(() => {
    let cancelled = false;
    decodeForCutter(file)
      .then((bmp) => {
        if (cancelled) {
          bmp.close();
          return;
        }
        bitmapRef.current?.close();
        bitmapRef.current = bmp;
        const c = controller;
        c.setImage(bmp.width, bmp.height);
        c.setMask(MASKS[maskIndex].aspect);
        setPhase("ready");
      })
      .catch((err) => {
        if (cancelled) return;
        setError(
          err instanceof ImagePipelineError ? err.message : `Could not open that photo: ${String(err)}`,
        );
        setPhase("error");
      });
    return () => {
      cancelled = true;
    };
    // maskIndex intentionally excluded: a fresh decode only depends on the file.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  // Measure the stage so the mask window can letterbox into it.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (box) setStage({ w: box.width, h: box.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Keep the controller's window size in sync (drag→source-px conversion depends on it).
  useEffect(() => {
    controller.setWindow(windowDims.width, windowDims.height);
  }, [windowDims.width, windowDims.height, controller]);

  // Re-cover when the mask (aspect) changes.
  useEffect(() => {
    if (phase === "ready") controller.setMask(mask.aspect);
  }, [mask.aspect, phase, controller]);

  // Draw the live preview via the SAME render path as the bake (preview == bake).
  useEffect(() => {
    const canvas = canvasRef.current;
    const bmp = bitmapRef.current;
    if (!canvas || !bmp || phase !== "ready" || windowDims.width < 1) return;

    const dpr = Math.min(MAX_DPR, typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1);
    const bw = Math.max(1, Math.round(windowDims.width * dpr));
    const bh = Math.max(1, Math.round(windowDims.height * dpr));
    if (canvas.width !== bw) canvas.width = bw;
    if (canvas.height !== bh) canvas.height = bh;
    canvas.style.width = `${windowDims.width}px`;
    canvas.style.height = `${windowDims.height}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    renderFrame(ctx, bmp, mask, transform, { width: bw, height: bh });
  }, [transform, windowDims.width, windowDims.height, mask, phase]);

  // Non-passive wheel so we can preventDefault the page scroll while zooming.
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      controller.wheel(e.deltaY);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [phase, controller]);

  // Release the transient bitmap on unmount.
  useEffect(() => {
    return () => {
      bitmapRef.current?.close();
      bitmapRef.current = null;
    };
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const { x, y } = localPoint(e);
    controller.pointerDown(e.pointerId, x, y);
  }, [controller]);
  const onPointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const { x, y } = localPoint(e);
    controller.pointerMove(e.pointerId, x, y);
  }, [controller]);
  const onPointerUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    controller.pointerUp(e.pointerId);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }, [controller]);

  const cycleMask = useCallback((dir: 1 | -1) => {
    setMaskIndex((i) => (i + dir + MASKS.length) % MASKS.length);
  }, []);

  const onCut = useCallback(async () => {
    const bmp = bitmapRef.current;
    if (!bmp || busy) return;
    setBusy(true);
    setError(null);
    try {
      const bake = await bakeStamp(bmp, MASKS[maskIndex], controller.getState());
      const id = await ingestStamp(bake);
      onConfirm(id);
    } catch (err) {
      setError(
        err instanceof ImagePipelineError ? `Cut failed: ${err.message}` : `Cut failed: ${String(err)}`,
      );
    } finally {
      setBusy(false);
    }
  }, [busy, maskIndex, onConfirm, controller]);

  const rotateActive = transform.mode === "rotate";

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4 rounded-card bg-paper p-4 text-ink shadow-sm">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-control px-3 py-1.5 text-sm text-muted hover:text-ink"
        >
          Cancel
        </button>
        <h2 className="font-title text-lg">Stamp machine</h2>
        <div className="w-[64px]" />
      </div>

      {/* Shape cycle */}
      <div className="flex items-center justify-center gap-4">
        <button
          type="button"
          aria-label="Previous shape"
          onClick={() => cycleMask(-1)}
          className="grid h-9 w-9 place-items-center rounded-control border border-line text-lg"
        >
          ‹
        </button>
        <span className="min-w-24 text-center text-sm font-medium">{mask.label}</span>
        <button
          type="button"
          aria-label="Next shape"
          onClick={() => cycleMask(1)}
          className="grid h-9 w-9 place-items-center rounded-control border border-line text-lg"
        >
          ›
        </button>
      </div>

      {/* Stage / mask window */}
      <div
        ref={stageRef}
        className="relative grid aspect-square w-full place-items-center overflow-hidden rounded-cell bg-accent-soft"
      >
        {phase === "decoding" && <p className="text-sm text-muted">Opening photo…</p>}
        {phase === "error" && (
          <p className="px-4 text-center text-sm text-accent">{error ?? "Could not open that photo."}</p>
        )}
        <canvas
          ref={canvasRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className={`touch-none select-none ${phase === "ready" ? "" : "hidden"}`}
          style={{ cursor: rotateActive ? "grab" : "move" }}
        />
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-2">
        <button
          type="button"
          onClick={() => controller.zoomOut()}
          className="grid h-10 w-10 place-items-center rounded-control border border-line text-lg"
          aria-label="Zoom out"
        >
          −
        </button>
        <button
          type="button"
          onClick={() => controller.zoomIn()}
          className="grid h-10 w-10 place-items-center rounded-control border border-line text-lg"
          aria-label="Zoom in"
        >
          +
        </button>
        <button
          type="button"
          onClick={() => controller.toggleMode()}
          aria-pressed={rotateActive}
          className={`rounded-control border px-4 py-2 text-sm font-medium ${
            rotateActive ? "border-accent bg-accent text-paper" : "border-line text-ink"
          }`}
        >
          Rotate
        </button>
      </div>

      {error && phase === "ready" && <p className="text-center text-sm text-accent">{error}</p>}

      <button
        type="button"
        onClick={() => void onCut()}
        disabled={phase !== "ready" || busy}
        className="rounded-control bg-accent py-3 text-base font-semibold text-paper disabled:opacity-50"
      >
        {busy ? "Cutting…" : "Cut"}
      </button>
    </div>
  );
}
