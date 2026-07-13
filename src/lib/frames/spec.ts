// M8 — the one place the frame geometry lives (PUNCH_WINDOW's lesson, M6). Every number in
// FRAMES was measured off the real asset by scripts/extract-frames.mjs and printed by it;
// re-exporting a frame is a one-object edit here, and spec.test.ts fails if the numbers stop
// being self-consistent. Pure: no React, no Dexie, no DOM — the CSS path in Calendar.tsx and
// M9's canvas export both read this.

import type { SelectedFrame } from "@/lib/db/types";

/** Per-side px, T/R/B/L. Source pixels in a spec; device px once scaled. */
export type Insets = { t: number; r: number; b: number; l: number };

export type FrameSpec = {
  id: SelectedFrame;
  /** Menu label. */
  label: string;
  /** Public path of the 9-slice tile sheet. */
  src: string;
  /** Sheet size in source px. Always `l + period + r` × `t + period + b`. */
  sheetW: number;
  sheetH: number;
  /** The border wave's period, source px, both axes. */
  period: number;
  /**
   * Ink thickness — the real border, and the only thing layout pays for
   * (`border-width: ink × scale`).
   */
  ink: Insets;
  /**
   * 9-slice inset — the ink grown to the period phase, so an edge tile meets its corner
   * seamlessly under `border-image-repeat: round`. Drives `border-image-slice`/`-width`;
   * the surplus over `ink` is what `border-image-outset` bleeds OUTWARD, which is why a
   * fat corner does not inflate the border box (M8-PLAN decision 5).
   */
  slice: Insets;
};

/** The column's own default (SCHEMA: `profiles.selected_frame default 'rse'`). */
export const DEFAULT_FRAME: SelectedFrame = "rse";

export const FRAMES: Record<SelectedFrame, FrameSpec> = {
  rse: {
    id: "rse",
    label: "Ruby",
    src: "/frames/rse.png",
    sheetW: 24,
    sheetH: 24,
    period: 8,
    ink: { t: 6, r: 6, b: 6, l: 6 },
    slice: { t: 8, r: 8, b: 8, l: 8 },
  },
  hgss_15: {
    id: "hgss_15",
    label: "Clouds",
    src: "/frames/hgss_15.png",
    sheetW: 40,
    sheetH: 22,
    period: 8,
    ink: { t: 6, r: 10, b: 6, l: 10 },
    slice: { t: 7, r: 16, b: 7, l: 16 },
  },
  hgss_18: {
    id: "hgss_18",
    label: "Leaves",
    src: "/frames/hgss_18.png",
    sheetW: 34,
    sheetH: 22,
    period: 8,
    ink: { t: 4, r: 11, b: 4, l: 11 },
    slice: { t: 7, r: 13, b: 7, l: 13 },
  },
};

/** Menu order. */
export const FRAME_IDS = Object.keys(FRAMES) as SelectedFrame[];

/**
 * Stepped **integer** scale: ×2 phone / ×3 tablet / ×4 desktop. Nearest-neighbour is exact at
 * every step, so the pixel art never lands on a half-pixel (a fluid `vw` scale shimmers on
 * resize and gives uneven bump widths — M8-PLAN decision 7).
 */
export function frameScale(viewportW: number): number {
  if (viewportW < 640) return 2;
  if (viewportW < 1024) return 3;
  return 4;
}

/**
 * The paper mat between the ring's inner edge and the grid, in **source px** (so it scales on
 * the same pixel step as the art). Without it the pixel scallops butt straight into the grid's
 * 1px hairlines — two different line languages touching — and the frame reads as stuck on
 * rather than wrapped around. It costs nothing: it comes out of the gutter the ring already
 * overhangs into.
 */
export const FRAME_MAT = 1;

/**
 * What the ring costs layout, per side, in device px — the **ink** only, never the fatter slice
 * (that surplus is drawn, not reserved; see frameCss). The ring is symmetric by construction, so
 * one number per axis is the whole truth. This is the `border-width` frameCss sets.
 */
export function frameInsets(
  frame: SelectedFrame,
  scale: number,
): { w: number; h: number } {
  const { ink } = FRAMES[frame];
  return { w: ink.l * scale, h: ink.t * scale };
}

/**
 * The whole framed box's inset per side — ring **plus** mat. This is what separates the grid
 * from the outside world, and therefore what `fit.ts` consumes as `frameW`/`frameH`.
 */
export function frameBoxInsets(
  frame: SelectedFrame,
  scale: number,
): { w: number; h: number } {
  const { ink } = FRAMES[frame];
  return { w: (ink.l + FRAME_MAT) * scale, h: (ink.t + FRAME_MAT) * scale };
}
