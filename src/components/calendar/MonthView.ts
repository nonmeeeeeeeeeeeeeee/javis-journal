import type { RefObject } from "react";

import type { DayData } from "@/lib/db/queries";
import type { SelectedFrame } from "@/lib/db/types";

/**
 * Shared prop contract for the two month views. The Calendar island owns fit
 * measurement (`cellW`, `headerRef`) and the reactive month data, so switching
 * views for the same month never re-signs thumbnails; the views are pure renderers
 * that build their own `monthGrid` from `{year, month, startOfWeek}`.
 */
export type MonthViewProps = {
  year: number;
  month: number;
  startOfWeek: number;
  /** `todayISO()` when the displayed month is the current real month, else null. */
  todayDate: string | null;
  /** Reactive `YYYY-MM-DD` -> day content (all live stamps + the month's thumbs/aspects). */
  data: Map<string, DayData>;
  /** Fitted day-cell width (px) from the shared fit model. */
  cellW: number;
  /** M8: the frame ringing the header + grid (US-10), and its stepped pixel scale. */
  frame: SelectedFrame;
  frameScale: number;
  /** Measured so the fit model can subtract the weekday-header height. */
  headerRef: RefObject<HTMLDivElement | null>;
  /** Tap a day: empty → the photo picker; with stamps → the day page. `rect` seeds the FLIP. */
  onOpenDay: (date: string, rect: DOMRect) => void;
};
