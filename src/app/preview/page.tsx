"use client";

import { useEffect, useState } from "react";

/**
 * Dev-only preview of the M4 calendar design so the owner can tune the layout
 * live. NOT a shipped route. The phone frame is locked to the iPhone 13 Pro Max
 * CSS viewport (428×926 portrait), the phone Javi actually uses, so the pixel
 * math (e.g. the "2.5 columns visible" close-up rule) lands exactly on-device.
 *
 * Two views:
 *  - close-up   — free horizontal scroll, 2.5 day-columns visible at rest.
 *  - full-month — whole 7×6 grid, no scroll in either direction.
 * Cell shape is fixed in both: height = width × (6/7) (wider than tall, matching
 * the 7-col : 6-row grid). The 6 rows do NOT stretch to fill height; leftover
 * vertical space becomes equal top/bottom margins (block is vertically centred).
 *
 * The close-up/full-month switcher below is a dev-only affordance for testing
 * without a touchscreen — the shipped product switches views by pinch gesture
 * only (DESIGN.md FLOW-7), with no visible toggle. The theme switcher is also
 * dev-only. Neither is part of the product chrome; both sit OUTSIDE the phone
 * frame so they don't distort its geometry.
 */

const THEMES = ["pastel", "paper", "scrapbook"] as const;
type Theme = (typeof THEMES)[number];

const VIEWS = ["close-up", "full-month"] as const;
type View = (typeof VIEWS)[number];

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const TODAY = 7;

// iPhone 13 Pro Max CSS viewport, and the frame's horizontal padding (px-4).
const FRAME_W = 428;
const FRAME_H = 926;
const FRAME_PAD = 16;
const INNER_W = FRAME_W - FRAME_PAD * 2; // 396

// Close-up: 2.5 columns visible at rest → each column is inner-width / 2.5.
const CLOSEUP_COL_W = INNER_W / 2.5; // 158.4

// Fixed cell aspect ratio: width : height = 7 : 6 (height = width × 6/7).
const CELL_ASPECT = "7 / 6";

// July 2026, Monday-start: July 1 is a Wednesday → 2 leading blanks, days 1–31.
// Always padded to a fixed 6 rows of 7 (42 cells) so the grid height stays
// stable across months (July only spans 5 weeks, but the layout reserves 6).
// Row-major.
const CELLS: (number | null)[] = [
  null,
  null,
  ...Array.from({ length: 31 }, (_, i) => i + 1),
];
while (CELLS.length < 42) CELLS.push(null);

// Column-major ordering, for the close-up grid (grid-auto-flow: column).
const CELLS_COL_MAJOR: (number | null)[] = [];
for (let col = 0; col < 7; col++) {
  for (let row = 0; row < 6; row++) {
    CELLS_COL_MAJOR.push(CELLS[row * 7 + col] ?? null);
  }
}

function DayCell({ day }: { day: number | null }) {
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

function MonthTitle() {
  return (
    <h1 className="text-center font-title text-4xl font-medium text-ink">
      July 2026
    </h1>
  );
}

/** Weekday labels. `colWidth` (close-up) pins each column to a fixed px width so
 *  the header aligns with — and scrolls in sync with — the scrolling grid.
 *  Omitted (full-month) → 7 equal columns filling the container. */
function WeekdayHeader({ colWidth }: { colWidth?: number }) {
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

/** Sticker tray + 3-dot menu, floating in the top margin band at the screen edge. */
function TopBar() {
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

/** Title above the calendar body, vertically centred in the frame so leftover
 *  space splits into equal top/bottom margins. `children` = view-specific body. */
function CalendarBlock({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col justify-center gap-3">
      <MonthTitle />
      {children}
    </div>
  );
}

function CloseUpView() {
  return (
    <CalendarBlock>
      {/* Free continuous horizontal scroll (no snap), clamped by content bounds.
          Header + grid share one scroller so labels track their columns.
          Scrollbar chrome is hidden: on the phone (touch) it's an auto-hiding
          overlay anyway, and the peeking columns already signal scrollability —
          hiding it keeps the preview honest to the device and the margins even. */}
      <div className="overflow-x-auto overflow-y-hidden [overscroll-behavior-x:contain] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div style={{ width: CLOSEUP_COL_W * 7 }}>
          <WeekdayHeader colWidth={CLOSEUP_COL_W} />
          <div
            className="grid border-l border-t border-line bg-line"
            style={{
              gridTemplateRows: "repeat(6, min-content)",
              gridAutoFlow: "column",
              gridAutoColumns: `${CLOSEUP_COL_W}px`,
            }}
          >
            {CELLS_COL_MAJOR.map((day, i) => (
              <DayCell key={i} day={day} />
            ))}
          </div>
        </div>
      </div>
    </CalendarBlock>
  );
}

function FullMonthView() {
  return (
    <CalendarBlock>
      <div>
        <WeekdayHeader />
        {/* Whole 7×6 grid, edge-to-edge, no scroll in either direction. */}
        <div className="grid grid-cols-7 border-l border-t border-line bg-line">
          {CELLS.map((day, i) => (
            <DayCell key={i} day={day} />
          ))}
        </div>
      </div>
    </CalendarBlock>
  );
}

function DevSwitcher<T extends string>({
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

export default function PreviewPage() {
  const [theme, setTheme] = useState<Theme>("pastel");
  const [view, setView] = useState<View>("close-up");

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  return (
    <div className="flex min-h-svh w-full flex-col items-center gap-4 bg-page py-6">
      {/* Dev-only controls — OUTSIDE the phone frame so they don't distort it. */}
      <div className="flex flex-wrap items-center justify-center gap-2">
        <DevSwitcher
          label="Preview theme"
          options={THEMES}
          value={theme}
          onChange={setTheme}
        />
        <DevSwitcher
          label="Preview view (dev-only; product uses pinch gesture)"
          options={VIEWS}
          value={view}
          onChange={setView}
          format={(v) => v.replace("-", " ")}
        />
      </div>

      {/* iPhone 13 Pro Max frame: exact 428×926 CSS viewport. */}
      <div
        className="relative flex-none overflow-hidden border border-line px-4 shadow-sm"
        style={{ width: FRAME_W, height: FRAME_H }}
      >
        <TopBar />
        {view === "close-up" ? <CloseUpView /> : <FullMonthView />}
      </div>
    </div>
  );
}
