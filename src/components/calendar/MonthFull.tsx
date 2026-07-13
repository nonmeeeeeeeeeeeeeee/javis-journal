"use client";

import { monthGrid } from "@/lib/calendar/month-grid";
import { DayCell } from "./DayCell";
import { WeekdayHeader } from "./WeekdayHeader";
import type { MonthViewProps } from "./MonthView";

/**
 * Full-month overview: the whole 7×6 grid, row-major, fit to the viewport with no
 * scroll on either axis. The Calendar island centers this block, so leftover space
 * becomes symmetric margins (airy side whitespace on desktop).
 */
export function MonthFull({
  year,
  month,
  startOfWeek,
  todayDate,
  data,
  cellW,
  headerRef,
  onOpenDay,
  stickerLayer,
  gridRef,
}: MonthViewProps) {
  const cells = monthGrid(year, month, startOfWeek);

  return (
    <div style={{ width: cellW > 0 ? cellW * 7 : undefined }}>
      <div ref={headerRef}>
        <WeekdayHeader startOfWeek={startOfWeek} colWidth={cellW} />
      </div>
      {/* The day-grid box: the sticker layer's coordinate box, and M9's export rect. */}
      <div ref={gridRef} className="relative">
        <div
          className="grid border-l border-t border-line bg-line"
          style={{ gridTemplateColumns: `repeat(7, ${cellW}px)` }}
        >
          {cells.map((cell, i) => (
            <DayCell
              key={i}
              cell={cell}
              isToday={cell !== null && cell.date === todayDate}
              day={cell ? (data.get(cell.date) ?? null) : null}
              width={cellW}
              onOpen={onOpenDay}
            />
          ))}
        </div>
        {stickerLayer}
      </div>
    </div>
  );
}
