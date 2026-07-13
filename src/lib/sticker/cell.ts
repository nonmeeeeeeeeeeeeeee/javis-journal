// Which day a point in the sticker layer lands on (M7, isolation case 4).
//
// An UNSELECTED sticker must never steal a tap from the day underneath it — but the sticker's
// own box is what receives that tap (it has to, or a long-press could never select it). So when
// the tap turns out to be a short tap on an unselected sticker, we hand it back to the day: this
// resolves the point to a date with the SAME grid geometry the two views lay out with, rather
// than by poking at the DOM (`elementFromPoint` under a rotated, transparent-cornered PNG is
// exactly the kind of thing that goes subtly wrong).
//
// Pure: no React, no Dexie, no DOM.

import type { CalendarView } from "@/lib/calendar/fit";
import { monthGrid, toColumnMajor } from "@/lib/calendar/month-grid";
import type { Point } from "@/lib/gestures/machine";
import { gridHeight } from "./layout";

export const COLS = 7;
export const ROWS = 6;

/**
 * The date at `p` (in grid pixels), or null on a blank pad cell / outside the grid.
 *
 * The two views differ only in flow: full-month is row-major, close-up is column-major (the
 * visual column is preserved either way — see `toColumnMajor`).
 */
export function dateAtGridPoint(
  p: Point,
  gridW: number,
  view: CalendarView,
  year: number,
  month: number,
  startOfWeek: number,
): string | null {
  if (gridW <= 0) return null;
  const cellW = gridW / COLS;
  const cellH = gridHeight(gridW) / ROWS;

  const col = Math.floor(p.x / cellW);
  const row = Math.floor(p.y / cellH);
  if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return null;

  const rowMajor = monthGrid(year, month, startOfWeek);
  const cells = view === "full-month" ? rowMajor : toColumnMajor(rowMajor);
  // Row-major reads across; column-major reads down — the same two flows the grids use.
  const index = view === "full-month" ? row * COLS + col : col * ROWS + row;

  return cells[index]?.date ?? null;
}
