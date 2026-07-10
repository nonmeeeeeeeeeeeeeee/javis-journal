import { describe, expect, test } from "vitest";

import {
  addMonths,
  compareYM,
  currentYearMonth,
  daysInMonth,
  EPOCH,
  isCurrentMonth,
  isMonthInBounds,
  isoDate,
  monthBounds,
  monthGrid,
  monthRange,
  toColumnMajor,
  todayISO,
  weekdayLabels,
  type GridCell,
} from "./month-grid";

function nonNull(cells: GridCell[]) {
  return cells.filter((c): c is { date: string; day: number } => c !== null);
}

/** Independent oracle for leading blanks, straight from the Date API. */
function expectedLeading(year: number, month: number, startOfWeek: number): number {
  const dow = new Date(year, month - 1, 1).getDay(); // 0=Sun..6=Sat
  const iso = dow === 0 ? 7 : dow;
  return (iso - startOfWeek + 7) % 7;
}

describe("monthGrid (ALG-5)", () => {
  test("July 2026, Monday-start: 2 leading blanks, days 1–31, padded to 42", () => {
    const cells = monthGrid(2026, 7, 1);
    expect(cells).toHaveLength(42);
    expect(cells[0]).toBeNull();
    expect(cells[1]).toBeNull();
    expect(cells[2]).toEqual({ date: "2026-07-01", day: 1 });
    expect(cells[32]).toEqual({ date: "2026-07-31", day: 31 });
    expect(cells[33]).toBeNull();
    expect(nonNull(cells)).toHaveLength(31);
  });

  test("July 2026, Sunday-start: 3 leading blanks", () => {
    const cells = monthGrid(2026, 7, 7);
    expect(cells.slice(0, 3).every((c) => c === null)).toBe(true);
    expect(cells[3]).toEqual({ date: "2026-07-01", day: 1 });
  });

  test.each([
    ["28-day non-leap Feb", 2026, 2, 28],
    ["29-day leap Feb", 2028, 2, 29],
    ["30-day Sep", 2026, 9, 30],
    ["31-day Jul", 2026, 7, 31],
  ])("%s has the right day count", (_label, y, m, count) => {
    expect(daysInMonth(y, m)).toBe(count);
    expect(nonNull(monthGrid(y, m, 1))).toHaveLength(count);
    expect(nonNull(monthGrid(y, m, 7))).toHaveLength(count);
  });

  test("invariants hold across 36 months × both week-starts", () => {
    for (let i = 0; i < 36; i++) {
      const { year, month } = addMonths({ year: 2026, month: 1 }, i);
      for (const start of [1, 7]) {
        const cells = monthGrid(year, month, start);
        // Fixed 42 slots.
        expect(cells).toHaveLength(42);
        // Correct leading blanks vs the independent Date oracle.
        const leading = expectedLeading(year, month, start);
        expect(cells.findIndex((c) => c !== null)).toBe(leading);
        // Blanks are contiguous at the ends: the non-null run is unbroken.
        const days = nonNull(cells);
        expect(days).toHaveLength(daysInMonth(year, month));
        days.forEach((c, idx) => {
          expect(c.day).toBe(idx + 1);
          expect(c.date).toBe(isoDate(year, month, idx + 1));
        });
        // The day cells occupy exactly [leading, leading+count).
        for (let k = 0; k < 42; k++) {
          const inRun = k >= leading && k < leading + days.length;
          expect(cells[k] === null).toBe(!inRun);
        }
      }
    }
  });
});

describe("toColumnMajor", () => {
  test("reorders a row-major grid into 7 columns × 6 rows, preserving visual columns", () => {
    const rowMajor = monthGrid(2026, 7, 1);
    const colMajor = toColumnMajor(rowMajor);
    expect(colMajor).toHaveLength(42);
    // Column 0 = the first cell of each of the 6 rows.
    for (let row = 0; row < 6; row++) {
      expect(colMajor[row]).toBe(rowMajor[row * 7]);
    }
    // Column 2, row 0 = July 1 (index 2 row-major).
    expect(colMajor[2 * 6]).toEqual({ date: "2026-07-01", day: 1 });
  });
});

describe("weekdayLabels", () => {
  test("Monday-start", () => {
    expect(weekdayLabels(1)).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
  });
  test("Sunday-start", () => {
    expect(weekdayLabels(7)).toEqual(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]);
  });
});

describe("today / current-month gating", () => {
  test("todayISO formats device-local date", () => {
    expect(todayISO(new Date(2026, 6, 7))).toBe("2026-07-07");
    expect(todayISO(new Date(2026, 0, 3))).toBe("2026-01-03");
  });

  test("currentYearMonth reads the local month", () => {
    expect(currentYearMonth(new Date(2026, 6, 7))).toEqual({ year: 2026, month: 7 });
  });

  test("isCurrentMonth is true only for the real current month", () => {
    const now = new Date(2026, 6, 15);
    expect(isCurrentMonth(2026, 7, now)).toBe(true);
    expect(isCurrentMonth(2026, 6, now)).toBe(false);
    expect(isCurrentMonth(2025, 7, now)).toBe(false);
  });
});

describe("month arithmetic + bounds", () => {
  test("addMonths wraps across year boundaries", () => {
    expect(addMonths({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
    expect(addMonths({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
    expect(addMonths({ year: 2026, month: 7 }, 6)).toEqual({ year: 2027, month: 1 });
  });

  test("compareYM orders chronologically", () => {
    expect(compareYM({ year: 2026, month: 7 }, { year: 2026, month: 8 })).toBeLessThan(0);
    expect(compareYM({ year: 2027, month: 1 }, { year: 2026, month: 12 })).toBeGreaterThan(0);
    expect(compareYM({ year: 2026, month: 7 }, { year: 2026, month: 7 })).toBe(0);
  });

  test("bounds are [EPOCH, current], arrows/months clamp accordingly", () => {
    const now = new Date(2026, 9, 15); // October 2026
    expect(monthBounds(now)).toEqual({
      min: EPOCH,
      max: { year: 2026, month: 10 },
    });
    // In range.
    expect(isMonthInBounds(2026, 7, now)).toBe(true); // EPOCH
    expect(isMonthInBounds(2026, 10, now)).toBe(true); // current
    expect(isMonthInBounds(2026, 9, now)).toBe(true);
    // Out of range.
    expect(isMonthInBounds(2026, 6, now)).toBe(false); // pre-epoch
    expect(isMonthInBounds(2026, 11, now)).toBe(false); // future
    expect(isMonthInBounds(2027, 1, now)).toBe(false);
  });
});

describe("monthRange (Dexie range scan bounds)", () => {
  test("half-open [first-of-month, first-of-next-month)", () => {
    expect(monthRange(2026, 7)).toEqual({
      start: "2026-07-01",
      endExclusive: "2026-08-01",
    });
  });
  test("wraps December into next year", () => {
    expect(monthRange(2026, 12)).toEqual({
      start: "2026-12-01",
      endExclusive: "2027-01-01",
    });
  });
});
