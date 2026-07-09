"use client";

import { useEffect, useState } from "react";

import {
  CELLS,
  CELLS_COL_MAJOR,
  DayCell,
  DevSwitcher,
  MonthTitle,
  THEMES,
  TopBar,
  WeekdayHeader,
  type Theme,
} from "./_shared";

/**
 * Dev-only preview of the M4 calendar design so the owner can tune the layout
 * live. NOT a shipped route. The phone frame is locked to the iPhone 13 Pro Max
 * CSS viewport (428×926 portrait), the phone Javi actually uses, so the pixel
 * math (e.g. the "2.5 columns visible" close-up rule) lands exactly on-device.
 * For the viewport-adaptive desktop version, see /preview/responsive.
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

const VIEWS = ["close-up", "full-month"] as const;
type View = (typeof VIEWS)[number];

// iPhone 13 Pro Max CSS viewport, and the frame's horizontal padding (px-4).
const FRAME_W = 428;
const FRAME_H = 926;
const FRAME_PAD = 16;
const INNER_W = FRAME_W - FRAME_PAD * 2; // 396

// Close-up: 2.5 columns visible at rest → each column is inner-width / 2.5.
const CLOSEUP_COL_W = INNER_W / 2.5; // 158.4

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
