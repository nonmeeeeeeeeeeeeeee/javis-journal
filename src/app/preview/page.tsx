"use client";

import { useEffect, useState } from "react";

/**
 * Dev-only preview of the M4 calendar design so the owner can tune the design
 * tokens live. NOT a shipped route — it renders the fit-to-screen month view
 * (whole month visible, no scroll, sized for iPhone 13 Pro Max portrait) and a
 * theme switcher that flips <html data-theme> between the shipped pastel theme
 * and the paper / scrapbook comparison themes.
 */

const THEMES = ["pastel", "paper", "scrapbook"] as const;
type Theme = (typeof THEMES)[number];

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const TODAY = 7;

// July 2026, Monday-start: July 1 is a Wednesday → 2 leading blanks, days 1–31,
// padded with trailing blanks to complete 6 rows of 7 (42 cells).
const CELLS: (number | null)[] = [
  null,
  null,
  ...Array.from({ length: 31 }, (_, i) => i + 1),
];
while (CELLS.length % 7 !== 0) CELLS.push(null);

export default function PreviewPage() {
  const [theme, setTheme] = useState<Theme>("pastel");

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  return (
    <div className="mx-auto flex h-[100svh] w-full max-w-md flex-col overflow-hidden p-4">
      {/* Top bar: sticker tray + 3-dots menu */}
      <div className="flex items-center justify-between">
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

      {/* Month title */}
      <h1 className="my-2 text-center font-title text-4xl font-medium text-ink">
        July 2026
      </h1>

      {/* Dev-only theme switcher */}
      <div
        className="mx-auto mb-3 grid grid-cols-3 gap-1 rounded-control border border-line bg-accent-soft p-1"
        role="group"
        aria-label="Preview theme"
      >
        {THEMES.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTheme(t)}
            aria-pressed={theme === t}
            className={`rounded-control px-3 py-1 text-xs font-bold capitalize transition-colors ${
              theme === t ? "bg-ink text-paper" : "text-muted"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Weekday header */}
      <div className="grid grid-cols-7 border border-b-0 border-line bg-paper">
        {WEEKDAYS.map((d) => (
          <div
            key={d}
            className="border-r border-line py-1.5 text-center text-[0.7rem] font-extrabold uppercase text-ink last:border-r-0"
          >
            {d}
          </div>
        ))}
      </div>

      {/* Month grid — fills remaining height, whole month visible, no scroll */}
      <div className="grid min-h-0 flex-1 grid-cols-7 grid-rows-6 border-l border-t border-line bg-line">
        {CELLS.map((day, i) => (
          <div
            key={i}
            className={`relative border-b border-r border-line ${
              day === null ? "bg-line-soft" : "bg-paper"
            }`}
          >
            {day !== null && (
              <span
                className={`absolute left-1.5 top-1.5 grid h-6 min-w-6 place-items-center rounded-full px-1 text-sm font-bold ${
                  day === TODAY ? "bg-today-bg text-today-ink" : "text-ink"
                }`}
              >
                {day}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
