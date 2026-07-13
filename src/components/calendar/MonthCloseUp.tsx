"use client";

import { useLayoutEffect, useRef } from "react";

import { monthGrid, toColumnMajor } from "@/lib/calendar/month-grid";
import { DayCell } from "./DayCell";
import { WeekdayHeader } from "./WeekdayHeader";
import type { MonthViewProps } from "./MonthView";

const SCROLL_PAD = 24; // matches the px-6 inner padding of the scroller (US-2 clamp)

/**
 * Close-up (home) view: column-major day flow, ~2.5 columns visible at rest, free
 * horizontal scroll with the scrollbar hidden. The US-2 clamp is the scroller's
 * fixed horizontal padding + content bounds — the outermost columns rest a fixed
 * margin from the edge and the scroll can't run past them.
 *
 * When the displayed month is the current month, it opens **centered on today's
 * column** (instant, no animation); the clamp wins at month edges. Non-current
 * months open left-aligned (column 1 at the fixed left margin).
 */
export function MonthCloseUp({
  year,
  month,
  startOfWeek,
  todayDate,
  data,
  cellW,
  headerRef,
  onOpenDay,
}: MonthViewProps) {
  const rowMajor = monthGrid(year, month, startOfWeek);
  const cells = toColumnMajor(rowMajor);
  const scrollerRef = useRef<HTMLDivElement>(null);

  // Center on today's column (current month only), instantly, once laid out.
  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el || cellW <= 0 || todayDate === null) return;

    const idx = rowMajor.findIndex((c) => c !== null && c.date === todayDate);
    if (idx < 0) return;
    const col = idx % 7; // visual column is preserved between row/column-major

    const columnCenter = SCROLL_PAD + col * cellW + cellW / 2;
    const target = columnCenter - el.clientWidth / 2;
    const max = el.scrollWidth - el.clientWidth;
    el.scrollLeft = Math.max(0, Math.min(target, max));
    // rowMajor is derived from these deps; re-center when cellW/month/today change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cellW, year, month, startOfWeek, todayDate]);

  return (
    // w-full, not w-screen: the scroller must live INSIDE the M8 frame ring, not run under it.
    <div className="w-full max-w-full">
      {/* Free horizontal scroll (pan-x lets 1-finger scroll while Calendar owns
          pinch); header + grid share the scroller so labels track their columns. */}
      <div
        ref={scrollerRef}
        className="overflow-x-auto overflow-y-hidden px-6 [overscroll-behavior-x:contain] [scrollbar-width:none] [touch-action:pan-x] [&::-webkit-scrollbar]:hidden"
      >
        <div style={{ width: cellW > 0 ? cellW * 7 : undefined }}>
          <div ref={headerRef}>
            <WeekdayHeader startOfWeek={startOfWeek} colWidth={cellW} />
          </div>
          <div
            className="grid border-l border-t border-line bg-line"
            style={{
              gridTemplateRows: "repeat(6, min-content)",
              gridAutoFlow: "column",
              gridAutoColumns: `${cellW}px`,
            }}
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
        </div>
      </div>
    </div>
  );
}
