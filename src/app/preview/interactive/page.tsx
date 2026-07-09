"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

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
} from "../_shared";

/**
 * Dev-only, fully interactive M4 calendar prototype: responsive sizing (from
 * /preview/responsive) + BOTH views + pinch-to-switch. NOT a shipped route.
 *
 * Views (DESIGN.md FLOW-7):
 *  - close-up   — detail: ~2.5 day-columns, free horizontal scroll.
 *  - full-month — overview: whole 7×6 grid, no scroll.
 * Desktop defaults to full-month; phones default to close-up (the home view).
 *
 * Switching:
 *  - Pinch (touch), OS-standard: spread fingers = magnify = close-up (detail);
 *    pinch together = zoom out = full-month (overview).
 *  - Trackpad pinch (ctrl+wheel) mirrors it on desktop.
 *  - A dev-only button toggle is provided so it's testable without gestures.
 * Each switch plays a ~250ms scale+fade (direction reads as zoom-in / zoom-out).
 *
 * Fit model is shared with /preview/responsive: cells keep a 7:6 ratio, the 6
 * rows never scroll vertically, and the binding dimension (width on a phone,
 * height on a desktop) decides cell size — leftover space becomes symmetric
 * margins (airy side whitespace on desktop).
 */

type View = "close-up" | "full-month";

const GUTTER = 24; // minimum breathing room around the calendar
const TITLE_GRID_GAP = 12; // matches the gap-3 between title and calendar body
const CLOSEUP_DIVISOR = 2.5; // columns visible at rest in close-up
const FULL_DIVISOR = 7;

// Pinch thresholds (ratio of current finger distance to gesture-start distance).
const SPREAD_RATIO = 1.2; // → close-up
const PINCH_RATIO = 0.83; // → full-month

type Metrics = { availW: number; availH: number; titleH: number; headerH: number };

function touchDistance(touches: TouchList): number {
  const [a, b] = [touches[0], touches[1]];
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

export default function InteractivePreviewPage() {
  const [theme, setTheme] = useState<Theme>("pastel");
  const [view, setView] = useState<View>("full-month");
  const [metrics, setMetrics] = useState<Metrics>({
    availW: 0,
    availH: 0,
    titleH: 40,
    headerH: 24,
  });

  const mainRef = useRef<HTMLElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const firstAnim = useRef(true);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  // Default to close-up on phones (coarse pointer / narrow), full-month on desktop.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time device read on mount
    if (!window.matchMedia("(min-width: 768px)").matches) setView("close-up");
  }, []);

  // Measure viewport + chrome heights; recompute on resize. ResizeObserver fires
  // an initial callback on observe(), so it also does the first measurement.
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() =>
      setMetrics({
        availW: el.clientWidth,
        availH: el.clientHeight,
        titleH: titleRef.current?.offsetHeight ?? 40,
        headerH: headerRef.current?.offsetHeight ?? 24,
      }),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, [view]);

  // Cell width: smaller of the width-bound and height-bound candidates, so the
  // grid always fits without vertical scroll and the binding dimension wins.
  const usableW = metrics.availW - GUTTER * 2;
  const usableH = metrics.availH - GUTTER * 2;
  const overhead = metrics.titleH + TITLE_GRID_GAP + metrics.headerH;
  const heightBoundW = ((usableH - overhead) / 6) * (7 / 6);
  const divisor = view === "full-month" ? FULL_DIVISOR : CLOSEUP_DIVISOR;
  const widthBoundW = usableW / divisor;
  const cellW = Math.max(0, Math.floor(Math.min(widthBoundW, heightBoundW)));

  // Animate each switch (skip the very first render / device-default set).
  useEffect(() => {
    const node = bodyRef.current;
    if (!node) return;
    if (firstAnim.current) {
      firstAnim.current = false;
      return;
    }
    // to close-up = zoom in (grow from smaller); to full-month = zoom out (settle from larger)
    const fromScale = view === "close-up" ? 0.9 : 1.08;
    node.animate(
      [
        { opacity: 0, transform: `scale(${fromScale})` },
        { opacity: 1, transform: "scale(1)" },
      ],
      { duration: 250, easing: "cubic-bezier(0.2, 0.7, 0.2, 1)" },
    );
  }, [view]);

  // Pinch (touch) + trackpad-pinch (ctrl+wheel) gesture detection.
  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;

    let startDist: number | null = null;
    let fired = false;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        startDist = touchDistance(e.touches);
        fired = false;
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || startDist == null) return;
      e.preventDefault(); // suppress native pinch-zoom while we interpret it
      if (fired) return;
      const ratio = touchDistance(e.touches) / startDist;
      if (ratio > SPREAD_RATIO) {
        setView("close-up");
        fired = true;
      } else if (ratio < PINCH_RATIO) {
        setView("full-month");
        fired = true;
      }
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) startDist = null;
    };
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return; // ctrl+wheel === trackpad pinch
      e.preventDefault();
      if (e.deltaY < 0) setView("close-up"); // pinch out / zoom in
      else if (e.deltaY > 0) setView("full-month");
    };

    el.addEventListener("touchstart", onTouchStart, { passive: false });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("wheel", onWheel);
    };
  }, []);

  const setViewSafe = useCallback((v: View) => setView(v), []);

  return (
    <main
      ref={mainRef}
      className="relative h-svh w-screen overflow-hidden bg-page [touch-action:none]"
    >
      <TopBar />

      <div
        ref={containerRef}
        className="flex h-full w-full flex-col items-center justify-center gap-3"
      >
        <div ref={titleRef}>
          <MonthTitle />
        </div>

        {/* Animated calendar body; keyed so a switch replays the scale+fade. */}
        <div key={view} ref={bodyRef}>
          {view === "full-month" ? (
            <FullMonthBody cellW={cellW} headerRef={headerRef} />
          ) : (
            <CloseUpBody cellW={cellW} headerRef={headerRef} />
          )}
        </div>
      </div>

      {/* Dev-only controls (theme + view), pinned so they don't shift the block. */}
      <div className="fixed inset-x-0 bottom-4 z-20 flex flex-wrap items-center justify-center gap-2">
        <DevSwitcher
          label="Preview theme"
          options={THEMES}
          value={theme}
          onChange={setTheme}
        />
        <DevSwitcher
          label="View (or pinch: spread = close-up, together = full-month)"
          options={["close-up", "full-month"] as const}
          value={view}
          onChange={setViewSafe}
          format={(v) => v.replace("-", " ")}
        />
      </div>
    </main>
  );
}

function FullMonthBody({
  cellW,
  headerRef,
}: {
  cellW: number;
  headerRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div style={{ width: cellW > 0 ? cellW * 7 : undefined }}>
      <div ref={headerRef}>
        <WeekdayHeader colWidth={cellW} />
      </div>
      <div
        className="grid border-l border-t border-line bg-line"
        style={{ gridTemplateColumns: `repeat(7, ${cellW}px)` }}
      >
        {CELLS.map((day, i) => (
          <DayCell key={i} day={day} />
        ))}
      </div>
    </div>
  );
}

function CloseUpBody({
  cellW,
  headerRef,
}: {
  cellW: number;
  headerRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div className="w-screen max-w-full">
      {/* Free horizontal scroll (pan-x lets 1-finger scroll while we own pinch);
          header + grid share the scroller so labels track their columns. */}
      <div className="overflow-x-auto overflow-y-hidden px-6 [overscroll-behavior-x:contain] [scrollbar-width:none] [touch-action:pan-x] [&::-webkit-scrollbar]:hidden">
        <div style={{ width: cellW > 0 ? cellW * 7 : undefined }}>
          <div ref={headerRef}>
            <WeekdayHeader colWidth={cellW} />
          </div>
          <div
            className="grid border-l border-t border-line bg-line"
            style={{
              gridTemplateRows: "repeat(6, min-content)",
              gridAutoFlow: "column",
              gridAutoColumns: `${cellW}px`,
            }}
          >
            {CELLS_COL_MAJOR.map((day, i) => (
              <DayCell key={i} day={day} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
