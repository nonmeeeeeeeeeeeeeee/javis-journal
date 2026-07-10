// Shared cell-fit model, ported verbatim from /preview/interactive. Pure math: given
// the available box + measured chrome heights, decide the day-cell width so the 7:6
// cells fill the binding dimension (width on phone-portrait, height on desktop-
// landscape), the 6 rows never scroll vertically, and leftover space becomes
// symmetric margins. Tiny cells on short/landscape viewports are acceptable — the
// grid shrinks, it never scrolls.

export type CalendarView = "close-up" | "full-month";

export const GUTTER = 24; // minimum breathing room around the calendar
export const TITLE_GRID_GAP = 12; // matches the gap-3 between title and calendar body
export const CLOSEUP_DIVISOR = 2.5; // columns visible at rest in close-up
export const FULL_DIVISOR = 7; // full-month shows all 7 columns

/** Cells keep a fixed 7:6 (width:height) ratio. */
export const CELL_ASPECT = "7 / 6";

export type FitMetrics = {
  /** Available box width (px). */
  availW: number;
  /** Available box height (px). */
  availH: number;
  /** Measured month-title height (px). */
  titleH: number;
  /** Measured weekday-header height (px). */
  headerH: number;
};

/**
 * Cell width for the given view + metrics. Picks the smaller of the width-bound and
 * height-bound candidates so the grid always fits without vertical scroll and the
 * binding dimension wins. Floored, never negative.
 */
export function computeCellW(view: CalendarView, m: FitMetrics): number {
  const usableW = m.availW - GUTTER * 2;
  const usableH = m.availH - GUTTER * 2;
  const overhead = m.titleH + TITLE_GRID_GAP + m.headerH;
  const heightBoundW = ((usableH - overhead) / 6) * (7 / 6);
  const divisor = view === "full-month" ? FULL_DIVISOR : CLOSEUP_DIVISOR;
  const widthBoundW = usableW / divisor;
  return Math.max(0, Math.floor(Math.min(widthBoundW, heightBoundW)));
}
