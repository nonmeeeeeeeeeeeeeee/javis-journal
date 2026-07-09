"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

import {
  CELLS,
  DayCell,
  DevSwitcher,
  MonthTitle,
  THEMES,
  TopBar,
  WeekdayHeader,
  type Theme,
} from "../_shared";

/**
 * Dev-only, viewport-adaptive counterpart to /preview. Where /preview is locked
 * to a fixed iPhone 13 Pro Max frame, this route sizes the calendar to the REAL
 * viewport so we can tune how Javi sees it on her PC. NOT a shipped route.
 *
 * Full-month only (close-up is a phone-only, pinch-driven view; desktop defaults
 * to full-month per DESIGN.md FLOW-7).
 *
 * Fit model — keep the same rules as /preview (7:6 cells, no scroll, symmetric
 * margins) but let whichever screen dimension is binding decide the size:
 *  - Portrait / narrow (phone): WIDTH is binding → cell = availW / 7, leftover
 *    height becomes equal top/bottom margins.
 *  - Landscape / wide (desktop): HEIGHT is binding → the 6 rows + title + header
 *    fit the viewport height, cell width derives from height (7:6), and the grid
 *    ends up narrower than the screen so leftover WIDTH becomes equal left/right
 *    margins — a centred calendar with airy side whitespace.
 * We simply take the smaller of the two candidate cell widths.
 */

// Minimum breathing room around the calendar, and the gap between title & grid.
const GUTTER = 24;
const TITLE_GRID_GAP = 12;

/** Measures the viewport and returns the largest cell width that lets the whole
 *  full-month block fit without scrolling, honouring the binding dimension. */
function useFitCellWidth() {
  const containerRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const [cellW, setCellW] = useState(0);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const compute = () => {
      const vw = el.clientWidth;
      const vh = el.clientHeight;
      const titleH = titleRef.current?.offsetHeight ?? 40;
      const headerH = headerRef.current?.offsetHeight ?? 24;

      const availW = vw - GUTTER * 2;
      const availH = vh - GUTTER * 2;
      const gridAreaH = availH - titleH - TITLE_GRID_GAP - headerH;

      // Candidate widths from each binding dimension. cellH = cellW × 6/7, so a
      // grid-area height of H allows cell width (H / 6) × 7/6.
      const wByWidth = availW / 7;
      const wByHeight = (gridAreaH / 6) * (7 / 6);

      setCellW(Math.max(0, Math.floor(Math.min(wByWidth, wByHeight))));
    };

    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return { containerRef, titleRef, headerRef, cellW };
}

export default function ResponsivePreviewPage() {
  const [theme, setTheme] = useState<Theme>("pastel");
  const { containerRef, titleRef, headerRef, cellW } = useFitCellWidth();

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  return (
    <main className="relative h-svh w-screen overflow-hidden bg-page">
      <TopBar />

      {/* Vertically + horizontally centred → symmetric margins on all sides.
          The binding dimension decides cellW (see useFitCellWidth). */}
      <div
        ref={containerRef}
        className="flex h-full w-full flex-col items-center justify-center gap-3"
      >
        <div ref={titleRef}>
          <MonthTitle />
        </div>

        <div style={{ width: cellW > 0 ? cellW * 7 : undefined }}>
          <div ref={headerRef}>
            <WeekdayHeader colWidth={cellW} />
          </div>
          {/* Whole 7×6 grid, no scroll in either direction. */}
          <div
            className="grid border-l border-t border-line bg-line"
            style={{ gridTemplateColumns: `repeat(7, ${cellW}px)` }}
          >
            {CELLS.map((day, i) => (
              <DayCell key={i} day={day} />
            ))}
          </div>
        </div>
      </div>

      {/* Dev-only theme switcher, pinned so it doesn't affect the centred block. */}
      <div className="fixed bottom-4 left-1/2 z-20 -translate-x-1/2">
        <DevSwitcher
          label="Preview theme"
          options={THEMES}
          value={theme}
          onChange={setTheme}
        />
      </div>
    </main>
  );
}
