// Pure calendar geometry + date helpers (ALG-5). No React, no Dexie — safe to unit
// test directly. `month` is 1-indexed (1 = January … 12 = December) everywhere in
// the app's calendar state; only the internal `Date` calls use 0-indexed months.
//
// `start_of_week` uses ISO weekday numbering: 1 = Monday … 7 = Sunday (matches the
// `profiles.start_of_week` column + its DB CHECK 1–7). M4 exposes only 1 / 7 in the
// UI, but the math supports any 1–7 start.

/** A single day cell in the 42-slot month grid, or a leading/trailing blank. */
export type GridCell = { date: string; day: number } | null;

/** {year, 1-indexed month}. */
export type YearMonth = { year: number; month: number };

/** The first month the app knows about — no month before this is reachable. */
export const EPOCH: YearMonth = { year: 2026, month: 7 };

/** ISO weekday order (Mon-first), index 0..6 ↔ ISO weekday 1..7. */
export const WEEKDAYS_ISO = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** `YYYY-MM-DD` for the given calendar parts (month 1-indexed). */
export function isoDate(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

/** Number of days in the given month (month 1-indexed). */
export function daysInMonth(year: number, month: number): number {
  // Day 0 of the next month == last day of this month.
  return new Date(year, month, 0).getDate();
}

/** ISO weekday (1 = Mon … 7 = Sun) of the given date's first day. */
function isoWeekday(year: number, month: number, day: number): number {
  const dow = new Date(year, month - 1, day).getDay(); // 0 = Sun … 6 = Sat
  return dow === 0 ? 7 : dow;
}

/**
 * ALG-5. Build the fixed 42-cell (6 rows × 7 cols) month grid, row-major, with
 * leading blanks derived from `startOfWeek` and trailing blanks padding to 6 rows
 * (so grid height is stable across months). Cells carry the ISO date + day number;
 * blanks are `null`.
 */
export function monthGrid(
  year: number,
  month: number,
  startOfWeek: number,
): GridCell[] {
  const firstIso = isoWeekday(year, month, 1);
  const leading = (firstIso - startOfWeek + 7) % 7;
  const total = daysInMonth(year, month);

  const cells: GridCell[] = [];
  for (let i = 0; i < leading; i++) cells.push(null);
  for (let day = 1; day <= total; day++) {
    cells.push({ date: isoDate(year, month, day), day });
  }
  while (cells.length < 42) cells.push(null);
  return cells;
}

/**
 * Reorder a row-major 42-cell grid into column-major order (7 columns × 6 rows) for
 * the close-up view's `grid-auto-flow: column` layout. Visual columns are preserved.
 */
export function toColumnMajor(cells: GridCell[]): GridCell[] {
  const out: GridCell[] = [];
  for (let col = 0; col < 7; col++) {
    for (let row = 0; row < 6; row++) {
      out.push(cells[row * 7 + col] ?? null);
    }
  }
  return out;
}

/** Weekday labels rotated to begin at `startOfWeek` (ISO 1..7). */
export function weekdayLabels(startOfWeek: number): string[] {
  const start = ((startOfWeek - 1) % 7 + 7) % 7;
  return [...WEEKDAYS_ISO.slice(start), ...WEEKDAYS_ISO.slice(0, start)];
}

/** Device-local today as `YYYY-MM-DD`. */
export function todayISO(now: Date = new Date()): string {
  return isoDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

/** The current real month (device-local). */
export function currentYearMonth(now: Date = new Date()): YearMonth {
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

/** True iff {year, month} is the current real month (device-local). */
export function isCurrentMonth(
  year: number,
  month: number,
  now: Date = new Date(),
): boolean {
  const cur = currentYearMonth(now);
  return year === cur.year && month === cur.month;
}

/** Compare two months: <0, 0, >0. */
export function compareYM(a: YearMonth, b: YearMonth): number {
  return a.year - b.year || a.month - b.month;
}

/** Add `delta` months to a {year, 1-indexed month}. */
export function addMonths(ym: YearMonth, delta: number): YearMonth {
  const total = ym.year * 12 + (ym.month - 1) + delta;
  return { year: Math.floor(total / 12), month: (total % 12) + 1 };
}

/** Inclusive picker bounds: [EPOCH, current real month]. */
export function monthBounds(now: Date = new Date()): { min: YearMonth; max: YearMonth } {
  return { min: EPOCH, max: currentYearMonth(now) };
}

/** True iff {year, month} is within the reachable [EPOCH, current] range. */
export function isMonthInBounds(
  year: number,
  month: number,
  now: Date = new Date(),
): boolean {
  const { min, max } = monthBounds(now);
  const ym = { year, month };
  return compareYM(ym, min) >= 0 && compareYM(ym, max) <= 0;
}

/**
 * Half-open ISO date range `[start, endExclusive)` covering the whole month —
 * used for the Dexie `entries.where('entry_date').between(...)` range scan.
 */
export function monthRange(
  year: number,
  month: number,
): { start: string; endExclusive: string } {
  const next = addMonths({ year, month }, 1);
  return {
    start: isoDate(year, month, 1),
    endExclusive: isoDate(next.year, next.month, 1),
  };
}
