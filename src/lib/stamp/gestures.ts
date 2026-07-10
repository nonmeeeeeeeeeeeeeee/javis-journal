// Pointer/gesture controller for the cutter surface. The photo is the only object, so there
// is no ALG-9 hit-testing — drag pans, pinch/wheel zooms, and (in rotate mode) drag rotates.
// Every mutation runs through normalize(), which applies the rotation-aware coverage clamp
// (coverScale) + pan clamp live, so a transparent gap can never appear on screen or in the
// bake. Framework-agnostic: React wires DOM events to these methods and redraws onChange.

import {
  clampPan,
  coverScale,
  minCoverScale,
  referenceSamplingWidth,
  type CoverParams,
} from "./geometry";
import type { Transform } from "./render";

export type CutterMode = "pan" | "rotate";
export type CutterState = Transform & { mode: CutterMode };

const MIN_SAMPLE_PX = 24; // max-zoom guard: never sample a region narrower than this
const WHEEL_STEP = 1.1;
const BUTTON_STEP = 1.2;

export class CutterController {
  private t: Transform = { offX: 0, offY: 0, scale: 1, rotation: 0 };
  private mode: CutterMode = "pan";
  private imgW = 1;
  private imgH = 1;
  private maskAspect = 1;
  private winW = 1;
  private winH = 1;

  private pointers = new Map<number, { x: number; y: number }>();
  private lastSingle: { x: number; y: number } | null = null;
  private pinch: { dist: number; mid: { x: number; y: number } } | null = null;

  constructor(private readonly onChange: (s: CutterState) => void) {}

  // ---- configuration ----
  setImage(w: number, h: number): void {
    this.imgW = Math.max(1, w);
    this.imgH = Math.max(1, h);
    this.t = { offX: 0, offY: 0, scale: 1, rotation: 0 };
    this.normalize();
    this.emit();
  }

  setMask(aspect: number): void {
    this.maskAspect = aspect;
    this.normalize(); // keep pan/zoom/rotation but re-cover the new aspect
    this.emit();
  }

  /** The mask window's on-screen size (CSS px) — converts drag pixels to source pixels. */
  setWindow(w: number, h: number): void {
    this.winW = Math.max(1, w);
    this.winH = Math.max(1, h);
  }

  getState(): CutterState {
    return { ...this.t, mode: this.mode };
  }

  setMode(mode: CutterMode): void {
    this.mode = mode;
    if (mode === "rotate") this.normalize(); // ensure min-cover as we enter rotate
    this.emit();
  }

  toggleMode(): void {
    this.setMode(this.mode === "pan" ? "rotate" : "pan");
  }

  // ---- discrete controls ----
  zoomIn(): void {
    this.zoomBy(BUTTON_STEP);
    this.emit();
  }
  zoomOut(): void {
    this.zoomBy(1 / BUTTON_STEP);
    this.emit();
  }
  wheel(deltaY: number): void {
    this.zoomBy(deltaY < 0 ? WHEEL_STEP : 1 / WHEEL_STEP);
    this.emit();
  }

  // ---- pointer stream (element-local coords) ----
  pointerDown(id: number, x: number, y: number): void {
    this.pointers.set(id, { x, y });
    if (this.pointers.size >= 2) {
      const [a, b] = [...this.pointers.values()];
      this.pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), mid: mid(a, b) };
      this.lastSingle = null;
    } else {
      this.lastSingle = { x, y };
    }
  }

  pointerMove(id: number, x: number, y: number): void {
    if (!this.pointers.has(id)) return;
    this.pointers.set(id, { x, y });
    const pts = [...this.pointers.values()];

    if (pts.length >= 2) {
      const [a, b] = pts;
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const m = mid(a, b);
      if (this.pinch) {
        if (this.pinch.dist > 0) this.zoomBy(dist / this.pinch.dist);
        this.panByScreen(m.x - this.pinch.mid.x, m.y - this.pinch.mid.y);
      }
      this.pinch = { dist, mid: m };
      this.lastSingle = null;
      this.emit();
      return;
    }

    if (this.lastSingle) {
      const dx = x - this.lastSingle.x;
      const dy = y - this.lastSingle.y;
      if (this.mode === "rotate") this.rotateByScreen(dx, dy);
      else this.panByScreen(dx, dy);
      this.emit();
    }
    this.lastSingle = { x, y };
  }

  pointerUp(id: number): void {
    this.pointers.delete(id);
    this.pinch = null;
    const rest = [...this.pointers.values()];
    this.lastSingle = rest.length === 1 ? rest[0] : null;
  }

  // ---- internals ----
  private params(): CoverParams {
    return { rotation: this.t.rotation, maskAspect: this.maskAspect, imgW: this.imgW, imgH: this.imgH };
  }

  private emit(): void {
    this.onChange(this.getState());
  }

  private samplingWidth(): number {
    return referenceSamplingWidth(this.maskAspect, this.imgW, this.imgH) / this.t.scale;
  }

  private panByScreen(dxScreen: number, dyScreen: number): void {
    // Rotation tilts the drag axes: convert the screen delta into the photo's (un-rotated)
    // frame so a drag moves the photo the way the finger goes at any angle.
    const src2screen = this.winW / this.samplingWidth();
    const dxSrc = dxScreen / src2screen;
    const dySrc = dyScreen / src2screen;
    const cos = Math.cos(this.t.rotation);
    const sin = Math.sin(this.t.rotation);
    this.t.offX -= dxSrc * cos + dySrc * sin;
    this.t.offY -= -dxSrc * sin + dySrc * cos;
    this.normalize();
  }

  private rotateByScreen(dxScreen: number, dyScreen: number): void {
    const span = Math.max(1, (this.winW + this.winH) / 2);
    this.t.rotation += ((dxScreen - dyScreen) * Math.PI) / span; // ~180° per window-span drag
    this.normalize();
  }

  private zoomBy(factor: number): void {
    const ws0 = referenceSamplingWidth(this.maskAspect, this.imgW, this.imgH);
    const minS = minCoverScale(this.params());
    const maxS = Math.max(minS, ws0 / MIN_SAMPLE_PX);
    this.t.scale = Math.min(maxS, Math.max(minS, this.t.scale * factor));
    this.normalize();
  }

  private normalize(): void {
    const p = this.params();
    this.t.scale = coverScale(this.t.scale, p);
    const { x, y } = clampPan({ x: this.t.offX, y: this.t.offY }, this.t.scale, p);
    this.t.offX = x;
    this.t.offY = y;
  }
}

function mid(a: { x: number; y: number }, b: { x: number; y: number }): { x: number; y: number } {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}
