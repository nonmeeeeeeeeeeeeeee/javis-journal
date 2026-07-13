"use client";

import type { StampBox } from "@/lib/day/layout";

/**
 * One stamp on the day page: a DOM `<img>`, not a canvas — the compositor animates `transform`
 * on the GPU (a smooth drag on a phone with no render loop), `layer_order` maps straight to
 * `z-index`, and M10's cut/place flourish can be a CSS keyframe on a real node. At ≤3 images
 * there is no perf argument for canvas; canvas stays where it belongs (the bake, the export).
 *
 * `box` is already the live box during a gesture (see `applyLive`) — this component just draws.
 */
export function DayStamp({
  box,
  url,
  selected,
}: {
  box: StampBox;
  url: string | undefined;
  selected: boolean;
}) {
  if (!url) return null;

  return (
    // Local object-URL / signed closeup from getCloseupUrls (ALG-6, released when the day
    // closes). Pointer events go to the gesture surface, never to the image.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      draggable={false}
      data-stamp-id={box.id}
      className="pointer-events-none absolute origin-center select-none"
      style={{
        left: box.x,
        top: box.y,
        width: box.w,
        height: box.h,
        zIndex: box.z,
        transform: `rotate(${box.rot}deg)`,
        // The selection marker: a blue glow underneath (decision 9). No handles, no chrome.
        filter: selected
          ? "drop-shadow(0 0 6px rgb(59 130 246 / 0.95)) drop-shadow(0 6px 16px rgb(59 130 246 / 0.6))"
          : "drop-shadow(0 2px 6px rgb(0 0 0 / 0.18))",
      }}
    />
  );
}
