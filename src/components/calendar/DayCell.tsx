"use client";

import { CELL_ASPECT } from "@/lib/calendar/fit";
import type { GridCell } from "@/lib/calendar/month-grid";
import type { DayData } from "@/lib/db/queries";
import { stampBoxes } from "@/lib/day/layout";

/**
 * One day cell: a blank (leading/trailing pad) or a numbered day. When the day has stamps it
 * renders the day's **faithful mini-composition** — every live stamp at its real position,
 * scale and rotation, through the same `stampBoxes()` the day page uses, at 256px-thumb size.
 * The cell and the page are both 7:6 boxes in the same normalized coordinates, so this is one
 * layout function at two pixel sizes (and the FLIP zoom has nothing to cross-fade).
 *
 * Today is marked via the `today-bg`/`today-ink` tokens.
 */
export function DayCell({
  cell,
  isToday,
  day,
  width,
  onOpen,
}: {
  cell: GridCell;
  isToday: boolean;
  day: DayData | null;
  /** The fitted cell width in px — the page width this composition is laid out against. */
  width: number;
  onOpen?: (date: string, rect: DOMRect) => void;
}) {
  if (cell === null) {
    return (
      <div
        className="border-b border-r border-line bg-line-soft"
        style={{ aspectRatio: CELL_ASPECT }}
        aria-hidden
      />
    );
  }

  const boxes = day && width > 0 ? stampBoxes(day.stamps, day.aspects, width) : [];
  const chipTone = isToday
    ? "bg-today-bg text-today-ink"
    : boxes.length > 0
      ? "bg-paper/85 text-ink"
      : "text-ink";

  return (
    <button
      type="button"
      onClick={(e) => onOpen?.(cell.date, e.currentTarget.getBoundingClientRect())}
      aria-label={cell.date}
      className="relative block w-full overflow-hidden border-b border-r border-line bg-paper p-0 text-left"
      style={{ aspectRatio: CELL_ASPECT }}
    >
      {/* `isolate` keeps the stamps' z-indexes (layer_order, which drifts as she taps
          front/back) in their own stacking context, under the day-number chip. */}
      <div className="absolute inset-0 isolate">
        {boxes.map((box) => {
          const url = day?.urls.get(box.image_id);
          if (!url) return null;
          return (
            // Local object-URL / signed thumb from getThumbUrls (ALG-6); next/image can't
            // optimize blob:/signed URLs and would fight the local-first model.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={box.id}
              src={url}
              alt=""
              loading="lazy"
              draggable={false}
              className="absolute origin-center"
              style={{
                left: box.x,
                top: box.y,
                width: box.w,
                height: box.h,
                zIndex: box.z,
                transform: `rotate(${box.rot}deg)`,
              }}
            />
          );
        })}
      </div>

      <span
        className={`absolute left-1 top-1 z-10 grid h-6 min-w-6 place-items-center rounded-full px-1 text-sm font-bold ${chipTone}`}
      >
        {cell.day}
      </span>
    </button>
  );
}
