// M8 — the CSS half of the frame. Kept out of Calendar.tsx so that component's diff stays a
// couple of lines (M7 is editing the same file), and so the geometry has exactly one home.

import type { CSSProperties } from "react";

import type { SelectedFrame } from "@/lib/db/types";
import { FRAMES } from "./spec";

/**
 * The `border-image` ring for a frame at an integer scale.
 *
 * The load-bearing subtlety is the gap between `ink` and `slice`. The 9-slice CORNER has to be
 * as wide as the wave takes to become periodic (16 source px on hgss_15), but the EDGE ink is
 * only 10px thick. In a naive `border-image` the corner width *is* the border thickness, so the
 * ring would inflate to 32px on a phone, blow fit.ts's 24px gutter, and eat grid cells.
 *
 * We split the two:
 *   border-width       = ink   × scale   ← all layout pays for (≤ 22px, fits the gutter)
 *   border-image-width = slice × scale   ← how thick the image ring is DRAWN
 *
 * with **`border-image-outset: 0`**. The slice inset is measured *inward* from the source's
 * outer edge, so the surplus is interior-side: the drawn ring overhangs the padding box by
 * `(slice − ink) × scale`, where it is transparent on the edges and carries only the corner
 * flourish at the corners. Nothing is clipped and nothing is occluded.
 *
 * (Outsetting the surplus *outward* — as the plan originally specified — moves source pixel 0
 * outside the border box. Verified in the browser: on a viewport-sized container inside an
 * `overflow-hidden` parent, that clips the outer scallops clean off. See M8-PLAN's deviation.)
 */
export function frameCss(frame: SelectedFrame, scale: number): CSSProperties {
  const { src, ink, slice } = FRAMES[frame];
  const px = (n: number) => `${n * scale}px`;

  return {
    borderStyle: "solid",
    borderColor: "transparent",
    borderWidth: `${px(ink.t)} ${px(ink.r)} ${px(ink.b)} ${px(ink.l)}`,
    borderImageSource: `url(${src})`,
    // Unitless = source pixels. No `fill` — the interior stays paper, so the theme survives
    // all three frames.
    borderImageSlice: `${slice.t} ${slice.r} ${slice.b} ${slice.l}`,
    borderImageWidth: `${px(slice.t)} ${px(slice.r)} ${px(slice.b)} ${px(slice.l)}`,
    borderImageOutset: "0",
    // `round` fits a WHOLE number of tiles between the corners, rescaling along the edge only.
    // `repeat` would clip a partial bump against each corner; `stretch` would smear the wave.
    borderImageRepeat: "round",
    imageRendering: "pixelated",
  };
}
