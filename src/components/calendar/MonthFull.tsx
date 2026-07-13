"use client";

import { monthGrid } from "@/lib/calendar/month-grid";
import { DayCell } from "./DayCell";
import { FramedGrid } from "./FramedGrid";
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
  frame,
  frameScale,
  headerRef,
  onOpenDay,
}: MonthViewProps) {
  const cells = monthGrid(year, month, startOfWeek);

  return (
    <FramedGrid
      frame={frame}
      scale={frameScale}
      width={cellW > 0 ? cellW * 7 : undefined}
    >
      <div ref={headerRef}>
        <WeekdayHeader startOfWeek={startOfWeek} colWidth={cellW} />
      </div>
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
    </FramedGrid>
  );
}
