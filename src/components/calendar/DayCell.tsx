"use client";

import { useState } from "react";

import { CELL_ASPECT } from "@/lib/calendar/fit";
import type { GridCell } from "@/lib/calendar/month-grid";

/**
 * One day cell: a blank (leading/trailing pad) or a numbered day. When the day has a
 * representative stamp, its 256px thumb fills the cell (`object-fit: cover`) and the
 * number chip sits on top. Today is marked via the `today-bg`/`today-ink` tokens.
 *
 * M4 renders only the single top-`layer_order` stamp thumb — no mask, no crop, no
 * multi-stamp composition (that faithful mini-composition is M5). Thumb selection is
 * isolated in `useMonthData`, so M5 can swap the source without touching this cell.
 */
export function DayCell({
  cell,
  isToday,
  thumbUrl,
}: {
  cell: GridCell;
  isToday: boolean;
  thumbUrl: string | null;
}) {
  const [loaded, setLoaded] = useState(false);

  if (cell === null) {
    return (
      <div
        className="border-b border-r border-line bg-line-soft"
        style={{ aspectRatio: CELL_ASPECT }}
        aria-hidden
      />
    );
  }

  const chipTone = isToday
    ? "bg-today-bg text-today-ink"
    : thumbUrl
      ? "bg-paper/85 text-ink"
      : "text-ink";

  return (
    <div
      className="relative overflow-hidden border-b border-r border-line bg-paper"
      style={{ aspectRatio: CELL_ASPECT }}
    >
      {thumbUrl ? (
        // Local object-URL / signed thumb from getThumbUrls (ALG-6); next/image
        // can't optimize blob:/signed URLs and would fight the local-first model.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={thumbUrl}
          src={thumbUrl}
          alt=""
          loading="lazy"
          onLoad={() => setLoaded(true)}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${
            loaded ? "opacity-100" : "opacity-0"
          }`}
        />
      ) : null}

      <span
        className={`absolute left-1 top-1 z-[1] grid h-6 min-w-6 place-items-center rounded-full px-1 text-sm font-bold ${chipTone}`}
      >
        {cell.day}
      </span>
    </div>
  );
}
