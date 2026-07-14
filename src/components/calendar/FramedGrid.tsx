"use client";

import type { ReactNode } from "react";

import type { SelectedFrame } from "@/lib/db/types";
import { FRAME_MAT } from "@/lib/frames/spec";
import { frameCss } from "@/lib/frames/style";

/**
 * The M9 export target. The frame wraps the weekday header + the 7×6 grid — and *only* those:
 * the month title stays outside it as page chrome. That makes the framed box the same rectangle
 * everywhere it matters — full-month, the close-up scroller (where it scrolls with the columns),
 * and the downloaded PNG — so M9 rasterizes exactly the element she has been looking at rather
 * than reconstructing a crop rule from CSS.
 *
 * This is why the wrapper mounts even when the frame is `'none'`: an unframed month is the framed
 * box wearing nothing, not the absence of the box. Let it vanish with the ring and M9's export
 * target vanishes with it.
 */
export const MONTH_FRAME_ATTR = "data-month-frame";

/**
 * The frame ring around a month's header + grid.
 *
 * `content-box` sizing is load-bearing: `width` is the GRID's width (`7 × cellW`), and the ring
 * and mat hang outside it. Under Tailwind's default `border-box` the ring would eat into the
 * seven columns and the cells would stop being the width the fit model just computed.
 */
export function FramedGrid({
  frame,
  scale,
  width,
  children,
}: {
  frame: SelectedFrame;
  scale: number;
  /** The grid's own width (`7 × cellW`), excluding ring + mat. */
  width: number | undefined;
  children: ReactNode;
}) {
  return (
    <div
      {...{ [MONTH_FRAME_ATTR]: "" }}
      className="bg-paper"
      style={{
        boxSizing: "content-box",
        width,
        // The paper mat between the ring and the grid — and with no ring, nothing to separate.
        padding: frame === "none" ? 0 : FRAME_MAT * scale,
        ...frameCss(frame, scale),
      }}
    >
      {children}
    </div>
  );
}
