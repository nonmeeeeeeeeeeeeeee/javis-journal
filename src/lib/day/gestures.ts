// The day page's gesture machine (the new ALG-9 — direct manipulation, no menu).
//
//   long-press  → select (the gate: an UNSELECTED stamp cannot be moved, so a fat thumb can
//                 never knock a finished composition askew)
//   one finger  → drag the selected stamp                      (clamped inside the page)
//   two fingers → pinch to scale + twist to rotate             (clamped; snapped to 45° on end)
//   short tap   → toggle front/back on ANY stamp               (the whole layer-order UI)
//   tap empty   → deselect
//
// Framework-agnostic: React feeds it pointer events in PAGE PIXELS and re-renders from
// `onChange`; it emits exactly ONE `onCommit` per gesture, on gesture-END — never per frame.

import { hitsBox, topElementAt } from "./hit";
import type { StampBox } from "./layout";
import {
  PAGE_ASPECT,
  clampCenter,
  clampScale,
  snapRotation,
  type Point,
} from "./place";

export const LONG_PRESS_MS = 450;
export const SLOP_PX = 8;

// ---- desktop steps (a mouse has no second finger) ----
/** One click of `+` / `−`, and one wheel notch, on the selected stamp. */
export const SCALE_STEP = 1.12;
/** One click of ⟲ / ⟳, and one arrow key. Lands on the 8 legal `rotation_deg` values. */
export const ROTATE_STEP_DEG = 45;
/**
 * A wheel has no `pointerup`, so a wheel "gesture" ends when the wheel goes quiet. Scaling is
 * live on every notch, but the WRITE happens once, this long after the last one — the same
 * one-write-per-gesture rule every other interaction obeys.
 */
export const WHEEL_COMMIT_MS = 250;

/** The live (uncommitted) transform of the stamp being manipulated, in normalized page coords. */
export type LiveTransform = {
  id: string;
  pos_x: number;
  pos_y: number;
  scale: number;
  /** Continuous during the gesture; snapped to 45° at `onCommit`. */
  rotation_deg: number;
};

export type GestureCallbacks = {
  /** The live transform changed — re-render (transform only; no write). */
  onChange: (live: LiveTransform | null) => void;
  /** Gesture end: write ONCE. `rotation_deg` is already snapped to a legal value. */
  onCommit: (t: LiveTransform) => void;
  /** A short tap on a stamp → front/back toggle. */
  onTap: (id: string) => void;
  /** A long-press on a stamp → select it. */
  onSelect: (id: string) => void;
  /** A tap on empty page space → deselect. */
  onDeselect: () => void;
};

type Mode = "idle" | "press" | "drag" | "transform" | "empty";

type Pointer = { id: number; p: Point };

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function angleDeg(a: Point, b: Point): number {
  return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
}

function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/**
 * One instance per open day page. `setContext` feeds it the current boxes + page width (they
 * change as she edits); the caller owns selection state and hands it back in.
 */
export class DayGestures {
  private boxes: StampBox[] = [];
  private pageW = 1;
  private selectedId: string | null = null;

  private pointers: Pointer[] = [];
  private mode: Mode = "idle";
  private hit: StampBox | null = null;
  private start: Point = { x: 0, y: 0 };
  private live: LiveTransform | null = null;
  private aspect = 1;
  private longPressTimer: ReturnType<typeof setTimeout> | null = null;
  private wheelTimer: ReturnType<typeof setTimeout> | null = null;
  private pinchStart: { dist: number; angle: number; scale: number; rotation: number } | null =
    null;

  constructor(private readonly cb: GestureCallbacks) {}

  setContext(boxes: StampBox[], pageW: number, selectedId: string | null): void {
    this.boxes = boxes;
    this.pageW = Math.max(1, pageW);
    this.selectedId = selectedId;
  }

  /** Page pixels → normalized page coords. */
  private norm(p: Point): Point {
    return { x: p.x / this.pageW, y: (p.y * PAGE_ASPECT) / this.pageW };
  }

  private clearTimer(): void {
    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
  }

  pointerDown(id: number, p: Point): void {
    this.pointers.push({ id, p });

    if (this.pointers.length === 2 && this.live && this.live.id === this.selectedId) {
      // Second finger on the selected stamp → pinch/twist.
      this.clearTimer();
      const [a, b] = this.pointers;
      this.mode = "transform";
      this.pinchStart = {
        dist: Math.max(1, dist(a.p, b.p)),
        angle: angleDeg(a.p, b.p),
        scale: this.live.scale,
        rotation: this.live.rotation_deg,
      };
      return;
    }

    if (this.pointers.length > 1) return;

    this.start = p;
    const hit = topElementAt(p, this.boxes);
    this.hit = hit;

    if (!hit) {
      this.mode = "empty";
      return;
    }

    this.mode = "press";
    this.aspect = hit.w / hit.h;
    this.live = {
      id: hit.id,
      pos_x: hit.cx / this.pageW,
      pos_y: hit.cy / (this.pageW / PAGE_ASPECT),
      scale: hit.w / this.pageW,
      rotation_deg: hit.rot,
    };

    this.longPressTimer = setTimeout(() => {
      this.longPressTimer = null;
      if (this.mode === "press" && this.hit) this.cb.onSelect(this.hit.id);
    }, LONG_PRESS_MS);
  }

  pointerMove(id: number, p: Point): void {
    const ptr = this.pointers.find((x) => x.id === id);
    if (!ptr) return;
    ptr.p = p;

    if (this.mode === "transform" && this.live && this.pinchStart) {
      const [a, b] = this.pointers;
      if (!a || !b) return;
      const d = Math.max(1, dist(a.p, b.p));
      const scale = clampScale(
        (this.pinchStart.scale * d) / this.pinchStart.dist,
        this.aspect,
        this.live.rotation_deg,
      );
      const rotation =
        this.pinchStart.rotation + (angleDeg(a.p, b.p) - this.pinchStart.angle);
      const scaled = clampScale(scale, this.aspect, rotation);
      const center = clampCenter(
        this.norm(midpoint(a.p, b.p)),
        scaled,
        this.aspect,
        rotation,
      );
      this.live = {
        ...this.live,
        scale: scaled,
        rotation_deg: rotation,
        pos_x: center.x,
        pos_y: center.y,
      };
      this.cb.onChange(this.live);
      return;
    }

    if (this.mode !== "press" && this.mode !== "drag") return;
    if (dist(p, this.start) > SLOP_PX) this.clearTimer();

    // Selection is the gate: only the selected stamp moves.
    if (!this.hit || this.hit.id !== this.selectedId || !this.live) return;
    if (this.mode === "press") {
      if (dist(p, this.start) <= SLOP_PX) return; // still a maybe-tap
      this.mode = "drag";
    }

    const dx = p.x - this.start.x;
    const dy = p.y - this.start.y;
    const center = clampCenter(
      this.norm({ x: this.hit.cx + dx, y: this.hit.cy + dy }),
      this.live.scale,
      this.aspect,
      this.live.rotation_deg,
    );
    this.live = { ...this.live, pos_x: center.x, pos_y: center.y };
    this.cb.onChange(this.live);
  }

  pointerUp(id: number): void {
    this.pointers = this.pointers.filter((x) => x.id !== id);
    if (this.pointers.length > 0) return; // a finger is still down — the gesture isn't over

    this.clearTimer();
    const { mode, hit, live } = this;
    this.mode = "idle";
    this.pinchStart = null;

    if (mode === "empty") {
      this.cb.onDeselect();
      this.reset();
      return;
    }

    if (mode === "press" && hit) {
      // No movement, no long-press → a short tap: front/back. (Also on the selected stamp,
      // which keeps its selection.)
      this.cb.onTap(hit.id);
      this.reset();
      return;
    }

    if ((mode === "drag" || mode === "transform") && live) {
      const rotation_deg = snapRotation(live.rotation_deg);
      const scale = clampScale(live.scale, this.aspect, rotation_deg);
      const center = clampCenter(
        { x: live.pos_x, y: live.pos_y },
        scale,
        this.aspect,
        rotation_deg,
      );
      const committed: LiveTransform = {
        id: live.id,
        pos_x: center.x,
        pos_y: center.y,
        scale,
        rotation_deg,
      };
      this.cb.onChange(committed);
      this.cb.onCommit(committed); // exactly one write per gesture
      this.reset();
      return;
    }

    this.reset();
  }

  // ---- desktop controls: the − + ⟲ ⟳ bar, the wheel, and the arrow keys -------------------
  //
  // They act on the SELECTED stamp (selection is the gate for the mouse exactly as it is for a
  // thumb), reuse the same clamps, and produce the same data as the touch gestures — a rotate
  // click is one 45° step, which is already a legal `rotation_deg`, so there is no second snap
  // path to keep in sync.

  /** The selected stamp's current transform (live if mid-gesture, else its persisted box). */
  private current(): LiveTransform | null {
    if (!this.selectedId) return null;
    if (this.live && this.live.id === this.selectedId) return this.live;
    const box = this.boxes.find((b) => b.id === this.selectedId);
    if (!box) return null;
    this.aspect = box.w / box.h;
    return {
      id: box.id,
      pos_x: box.cx / this.pageW,
      pos_y: box.cy / (this.pageW / PAGE_ASPECT),
      scale: box.w / this.pageW,
      rotation_deg: box.rot,
    };
  }

  private applyDesktop(next: LiveTransform, commit: "now" | "debounced"): void {
    const rotation_deg = snapRotation(next.rotation_deg);
    const scale = clampScale(next.scale, this.aspect, rotation_deg);
    const center = clampCenter(
      { x: next.pos_x, y: next.pos_y },
      scale,
      this.aspect,
      rotation_deg,
    );
    const t: LiveTransform = {
      id: next.id,
      pos_x: center.x,
      pos_y: center.y,
      scale,
      rotation_deg,
    };

    this.live = t;
    this.cb.onChange(t);

    if (this.wheelTimer) {
      clearTimeout(this.wheelTimer);
      this.wheelTimer = null;
    }
    if (commit === "now") {
      this.cb.onCommit(t);
      this.reset();
      return;
    }
    this.wheelTimer = setTimeout(() => {
      this.wheelTimer = null;
      this.cb.onCommit(t);
      this.reset();
    }, WHEEL_COMMIT_MS);
  }

  /** `+` / `−` on the desktop bar, and the `+` / `-` keys. One write per click. */
  scaleStep(direction: 1 | -1): void {
    const cur = this.current();
    if (!cur) return;
    const factor = direction > 0 ? SCALE_STEP : 1 / SCALE_STEP;
    this.applyDesktop({ ...cur, scale: cur.scale * factor }, "now");
  }

  /** ⟲ / ⟳ on the desktop bar, and the ← / → keys. One 45° step = one legal rotation_deg. */
  rotateStep(direction: 1 | -1): void {
    const cur = this.current();
    if (!cur) return;
    this.applyDesktop(
      { ...cur, rotation_deg: cur.rotation_deg + direction * ROTATE_STEP_DEG },
      "now",
    );
  }

  /** The wheel scales the selected stamp: live per notch, ONE write once the wheel goes quiet. */
  wheel(deltaY: number): void {
    const cur = this.current();
    if (!cur) return;
    const factor = deltaY < 0 ? SCALE_STEP : 1 / SCALE_STEP;
    this.applyDesktop({ ...cur, scale: cur.scale * factor }, "debounced");
  }

  cancel(): void {
    this.clearTimer();
    if (this.wheelTimer) {
      clearTimeout(this.wheelTimer);
      this.wheelTimer = null;
    }
    this.pointers = [];
    this.mode = "idle";
    this.pinchStart = null;
    this.reset();
  }

  private reset(): void {
    this.hit = null;
    this.live = null;
    this.cb.onChange(null);
  }

  /** Exposed for the harness/tests: does this point land on this box? */
  static hits(p: Point, box: StampBox): boolean {
    return hitsBox(p, box);
  }
}
