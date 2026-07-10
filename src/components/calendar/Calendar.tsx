"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { computeCellW, type CalendarView, type FitMetrics } from "@/lib/calendar/fit";
import {
  currentYearMonth,
  isCurrentMonth,
  todayISO,
  type YearMonth,
} from "@/lib/calendar/month-grid";
import { useMonthData, useProfile } from "@/lib/db/queries";
import { MonthCloseUp } from "./MonthCloseUp";
import { MonthFull } from "./MonthFull";
import { MonthTitle } from "./MonthTitle";
import { TopBar } from "./TopBar";
import type { MonthViewProps } from "./MonthView";

const TITLE_GRID_GAP = 12; // matches the gap-3 between title and calendar body

// Pinch thresholds (ratio of current finger distance to gesture-start distance).
const SPREAD_RATIO = 1.2; // fingers apart → close-up (detail)
const PINCH_RATIO = 0.83; // fingers together → full-month (overview)

function touchDistance(touches: TouchList): number {
  const a = touches[0];
  const b = touches[1];
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * The calendar home island. Owns `{view, year, month}` (pure client state, never the
 * URL), the shared fit measurement, the reactive month data + profile, the
 * pinch-to-switch gesture, and the ~250ms switch animation. Renders `TopBar`,
 * `MonthTitle`, and the active month view. The 3-dots menu + month picker (and the
 * handlers that change month / week-start / sign out) are wired in T6.
 */
export function Calendar() {
  const [view, setView] = useState<CalendarView>("full-month");
  // The month-navigation setter is added in T6 (menu + picker); T5 opens on the
  // current month and never changes it.
  const [{ year, month }] = useState<YearMonth>(() => currentYearMonth());
  const [metrics, setMetrics] = useState<FitMetrics>({
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
  const firstRender = useRef(true);

  const profile = useProfile();
  const data = useMonthData(year, month);

  const todayDate = isCurrentMonth(year, month) ? todayISO() : null;
  const cellW = computeCellW(view, metrics);

  // Measure viewport + chrome heights; recompute on resize. ResizeObserver fires an
  // initial callback on observe(), so it also does the first measurement. Re-run on
  // [view] because the header element is swapped between the two views.
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

  // Animate each switch (skip the very first render / device-default correction).
  useEffect(() => {
    const node = bodyRef.current;
    if (!node) return;
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (prefersReducedMotion()) return;
    // to close-up = zoom in (grow from smaller); to full-month = zoom out.
    const fromScale = view === "close-up" ? 0.9 : 1.08;
    node.animate(
      [
        { opacity: 0, transform: `scale(${fromScale})` },
        { opacity: 1, transform: "scale(1)" },
      ],
      { duration: 250, easing: "cubic-bezier(0.2, 0.7, 0.2, 1)" },
    );
  }, [view]);

  // Default to close-up on coarse (touch) pointers; suppress the switch animation
  // for this one programmatic correction so first paint doesn't zoom.
  useEffect(() => {
    if (window.matchMedia("(pointer: coarse)").matches) {
      firstRender.current = true;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time device read on mount
      setView("close-up");
    }
  }, []);

  // Pinch (2-finger) gesture. We own pinch: touch-action:none on the surface +
  // preventDefault on 2-finger moves. The close-up scroller keeps touch-action:pan-x
  // so a single finger still scrolls columns.
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

    el.addEventListener("touchstart", onTouchStart, { passive: false });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
    };
  }, []);

  const viewProps: MonthViewProps = {
    year,
    month,
    startOfWeek: profile.startOfWeek,
    todayDate,
    data,
    cellW,
    headerRef,
  };

  return (
    <main
      ref={mainRef}
      className="relative h-svh w-screen overflow-hidden bg-page [touch-action:none]"
    >
      <TopBar />

      <div
        ref={containerRef}
        className="flex h-full w-full flex-col items-center justify-center"
        style={{ gap: TITLE_GRID_GAP }}
      >
        <div ref={titleRef}>
          <MonthTitle year={year} month={month} />
        </div>

        {/* Keyed so a view switch replays the scale+fade on a fresh node. */}
        <div key={view} ref={bodyRef}>
          {view === "full-month" ? (
            <MonthFull {...viewProps} />
          ) : (
            <MonthCloseUp {...viewProps} />
          )}
        </div>
      </div>
    </main>
  );
}
