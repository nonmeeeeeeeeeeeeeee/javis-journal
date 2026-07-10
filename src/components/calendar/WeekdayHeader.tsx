"use client";

import { weekdayLabels } from "@/lib/calendar/month-grid";

/**
 * Weekday label row, derived from `startOfWeek` (ISO 1 = Mon … 7 = Sun). `colWidth`
 * pins each column to a fixed px width so the header aligns with a fixed-width grid;
 * omit it for 7 equal columns filling the box.
 */
export function WeekdayHeader({
  startOfWeek,
  colWidth,
}: {
  startOfWeek: number;
  colWidth?: number;
}) {
  const labels = weekdayLabels(startOfWeek);

  return (
    <div
      className="grid border border-b-0 border-line bg-paper"
      style={
        colWidth != null
          ? {
              gridTemplateColumns: `repeat(7, ${colWidth}px)`,
              width: colWidth * 7,
            }
          : { gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }
      }
    >
      {labels.map((d) => (
        <div
          key={d}
          className="border-r border-line py-1.5 text-center text-[0.7rem] font-extrabold uppercase text-ink last:border-r-0"
        >
          {d}
        </div>
      ))}
    </div>
  );
}
