/**
 * Shared calendar primitives for the dev-only /preview routes. NOT shipped UI —
 * these exist so /preview (fixed iPhone frame) and /preview/responsive (adapts to
 * the real viewport) render the exact same calendar chrome and stay in sync.
 *
 * The M4 build will rebuild these as real components; this is a design sandbox.
 */

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const TODAY = 7;

// July 2026, Monday-start: July 1 is a Wednesday → 2 leading blanks, days 1–31.
// Always padded to a fixed 6 rows of 7 (42 cells) so the grid height stays
// stable across months (July only spans 5 weeks, but the layout reserves 6).
// Row-major.
export const CELLS: (number | null)[] = [
  null,
  null,
  ...Array.from({ length: 31 }, (_, i) => i + 1),
];
while (CELLS.length < 42) CELLS.push(null);

// Column-major ordering, for the close-up grid (grid-auto-flow: column).
export const CELLS_COL_MAJOR: (number | null)[] = [];
for (let col = 0; col < 7; col++) {
  for (let row = 0; row < 6; row++) {
    CELLS_COL_MAJOR.push(CELLS[row * 7 + col] ?? null);
  }
}

// Fixed cell aspect ratio: width : height = 7 : 6 (height = width × 6/7).
export const CELL_ASPECT = "7 / 6";

// A full 7×6 grid of 7:6 cells is itself 49:36 — a fixed ratio regardless of
// size. The responsive view uses this to fit the whole grid into any viewport.
export const GRID_ASPECT_W = 49;
export const GRID_ASPECT_H = 36;

export function DayCell({ day }: { day: number | null }) {
  return (
    <div
      className={`relative border-b border-r border-line ${
        day === null ? "bg-line-soft" : "bg-paper"
      }`}
      style={{ aspectRatio: CELL_ASPECT }}
    >
      {day !== null && (
        <span
          className={`absolute left-1 top-1 grid h-6 min-w-6 place-items-center rounded-full px-1 text-sm font-bold ${
            day === TODAY ? "bg-today-bg text-today-ink" : "text-ink"
          }`}
        >
          {day}
        </span>
      )}
    </div>
  );
}

export function MonthTitle() {
  return (
    <h1 className="text-center font-title text-4xl font-medium text-ink">
      July 2026
    </h1>
  );
}

/** Weekday labels. `colWidth` pins each column to a fixed px width so the header
 *  aligns with a fixed-width grid; omit it for 7 equal columns filling the box. */
export function WeekdayHeader({ colWidth }: { colWidth?: number }) {
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
      {WEEKDAYS.map((d) => (
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

/** Sticker tray + 3-dot menu, floating at the top corners of the calendar. */
export function TopBar() {
  return (
    <div className="absolute inset-x-4 top-3 z-10 flex items-center justify-between">
      <button
        type="button"
        aria-label="Sticker tray"
        className="grid size-11 place-items-center rounded-control border border-line bg-paper text-xl shadow-sm"
      >
        <span aria-hidden>😛</span>
      </button>
      <button
        type="button"
        aria-label="Menu"
        className="grid size-11 place-items-center rounded-control border border-line bg-paper shadow-sm"
      >
        <span className="grid gap-1" aria-hidden>
          <span className="block size-1 rounded-full bg-ink" />
          <span className="block size-1 rounded-full bg-ink" />
          <span className="block size-1 rounded-full bg-ink" />
        </span>
      </button>
    </div>
  );
}

const THEMES = ["pastel", "paper", "scrapbook"] as const;
export type Theme = (typeof THEMES)[number];

/** Dev-only segmented switcher (themes, views, …). Not product chrome. */
export function DevSwitcher<T extends string>({
  label,
  options,
  value,
  onChange,
  format = (o) => o,
}: {
  label: string;
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  format?: (o: T) => string;
}) {
  return (
    <div
      className="flex gap-1 rounded-control border border-line bg-accent-soft p-1"
      role="group"
      aria-label={label}
    >
      {options.map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => onChange(o)}
          aria-pressed={value === o}
          className={`rounded-control px-3 py-1 text-xs font-bold capitalize transition-colors ${
            value === o ? "bg-ink text-paper" : "text-muted"
          }`}
        >
          {format(o)}
        </button>
      ))}
    </div>
  );
}

export { THEMES };
