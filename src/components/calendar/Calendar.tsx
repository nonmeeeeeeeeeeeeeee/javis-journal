"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { computeCellW, type CalendarView, type FitMetrics } from "@/lib/calendar/fit";
import { pinchDecision } from "@/lib/calendar/pinch";
import {
  currentYearMonth,
  isCurrentMonth,
  todayISO,
  type YearMonth,
} from "@/lib/calendar/month-grid";
import { useMonthData, useProfile } from "@/lib/db/queries";
import { setStartOfWeek } from "@/lib/db/mutations";
import { frameInsets, frameScale } from "@/lib/frames/spec";
import { frameCss } from "@/lib/frames/style";
import { AddStampFlow } from "@/components/day/AddStampFlow";
import { DayPage } from "@/components/day/DayPage";
import { CalendarMenu } from "./CalendarMenu";
import { MonthCloseUp } from "./MonthCloseUp";
import { MonthFull } from "./MonthFull";
import { MonthPicker } from "./MonthPicker";
import { MonthTitle } from "./MonthTitle";
import { TopBar } from "./TopBar";
import type { MonthViewProps } from "./MonthView";

const TITLE_GRID_GAP = 12; // matches the gap-3 between title and calendar body

/** The open day page: the date, plus the cell rect the FLIP zoom grows out of (null → instant). */
export type OpenDay = { date: string; rect: DOMRect | null };

function touchDistance(touches: TouchList): number {
  const a = touches[0];
  const b = touches[1];
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

/** The day cell's on-screen rect, so a stamp added from an empty day still zooms out of it. */
function cellRect(date: string): DOMRect | null {
  const el = document.querySelector<HTMLElement>(`[aria-label="${date}"]`);
  return el ? el.getBoundingClientRect() : null;
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
  const [{ year, month }, setYearMonth] = useState<YearMonth>(() =>
    currentYearMonth(),
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [openDay, setOpenDay] = useState<OpenDay | null>(null);
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<FitMetrics>({
    availW: 0,
    availH: 0,
    titleH: 40,
    headerH: 24,
  });

  const mainRef = useRef<HTMLElement>(null);
  // Read by the pinch handler without re-binding it (pinch isolation, decision 10).
  const dayOpenRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const firstRender = useRef(true);

  // M8: the frame's scale is stepped off the *viewport*, not the container — the container is
  // already inside the ring, so reading it back would feed the breakpoint its own output.
  // 0 until mounted, which also keeps SSR and hydration agreeing on "no frame yet".
  const [viewportW, setViewportW] = useState(0);

  const profile = useProfile();
  const data = useMonthData(year, month);

  const todayDate = isCurrentMonth(year, month) ? todayISO() : null;

  // The frame ring: `ink × scale` per side is all layout pays (the fat corner is drawn, not
  // reserved — see frameCss), and fit.ts absorbs that into the gutter it already reserved, so
  // on a phone the grid does not lose a single cell.
  const framed = viewportW > 0;
  const scale = frameScale(viewportW);
  const ring = frameInsets(profile.selectedFrame, scale);
  const cellW = computeCellW(view, {
    ...metrics,
    frameW: framed ? ring.w : 0,
    frameH: framed ? ring.h : 0,
  });

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

  // Track the viewport for the frame's stepped scale (×2 / ×3 / ×4).
  useEffect(() => {
    const onResize = () => setViewportW(window.innerWidth);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

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
  //
  // Pinch isolation (M6, belt and braces): while a day is open, a pinch belongs to the stamp
  // being scaled, never to the calendar behind it. The overlay stops propagation AND this
  // handler no-ops off a state check — a listener detail can be broken by a refactor; a state
  // check cannot. `dayOpenRef` keeps the check live without re-binding the listeners.
  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;

    let startDist: number | null = null;
    let fired = false;

    const onTouchStart = (e: TouchEvent) => {
      if (dayOpenRef.current) return;
      if (e.touches.length === 2) {
        startDist = touchDistance(e.touches);
        fired = false;
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (dayOpenRef.current) return;
      if (e.touches.length !== 2 || startDist == null) return;
      e.preventDefault(); // suppress native pinch-zoom while we interpret it
      if (fired) return;
      const next = pinchDecision(touchDistance(e.touches) / startDist, dayOpenRef.current);
      if (next) {
        setView(next);
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

  useEffect(() => {
    dayOpenRef.current = openDay !== null || addingTo !== null;
  }, [openDay, addingTo]);

  // The system back gesture closes the day instead of leaving the app: opening a day pushes a
  // history entry, popstate closes it. (Closing from inside the app pops it back off.)
  useEffect(() => {
    if (!openDay) return;
    window.history.pushState({ day: openDay.date }, "");
    const onPop = () => setOpenDay(null);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [openDay]);

  const closeDay = () => {
    setSelected(null);
    // Pop our own guard entry; the popstate listener clears the overlay state.
    if (window.history.state?.day) window.history.back();
    else setOpenDay(null);
  };

  const toggleView = () =>
    setView((v) => (v === "full-month" ? "close-up" : "full-month"));

  const onOpenDay = (date: string, rect: DOMRect) => {
    const day = data.get(date);
    if (!day || day.stamps.length === 0) {
      // US-7, literally: an empty day never shows an empty page — it opens the picker.
      setAddingTo(date);
      return;
    }
    setOpenDay({ date, rect });
  };

  const viewProps: MonthViewProps = {
    year,
    month,
    startOfWeek: profile.startOfWeek,
    todayDate,
    data,
    cellW,
    headerRef,
    onOpenDay,
  };

  return (
    <main
      ref={mainRef}
      className="relative h-svh w-screen overflow-hidden bg-page [touch-action:none]"
    >
      <TopBar onMenu={() => setMenuOpen(true)} />

      {/* The frame rings the whole calendar block, in both views. It goes on THIS element
          because `clientWidth/Height` — what the ResizeObserver below already reads — is the
          padding box, i.e. already inside the border: the fit model sees the shrunk box for
          free. A real border (not an overlay) also means the close-up's scroller clips its
          columns exactly at the ring's inner edge, with no z-index or occlusion logic. */}
      <div
        ref={containerRef}
        className="flex h-full w-full flex-col items-center justify-center"
        style={{
          gap: TITLE_GRID_GAP,
          ...(framed ? frameCss(profile.selectedFrame, scale) : null),
        }}
      >
        <div ref={titleRef}>
          <MonthTitle
            year={year}
            month={month}
            onLongPress={() => setPickerOpen(true)}
          />
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

      <CalendarMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        onToggleView={toggleView}
        onChangeMonth={() => setPickerOpen(true)}
        startOfWeek={profile.startOfWeek}
        onSetWeekStart={(value) => void setStartOfWeek(value)}
      />

      {pickerOpen ? (
        <MonthPicker
          onClose={() => setPickerOpen(false)}
          viewed={{ year, month }}
          onPick={(ym) => setYearMonth(ym)}
        />
      ) : null}

      {addingTo ? (
        <AddStampFlow
          key={addingTo}
          date={addingTo}
          onPlaced={(stamp) => {
            const date = addingTo;
            setAddingTo(null);
            // Back to the day with the new stamp placed, on top, and SELECTED — she just made
            // it, it is the thing she is most likely to nudge, and it teaches the selection
            // affordance with no tutorial (decision 12).
            setOpenDay((prev) => prev ?? { date, rect: cellRect(date) });
            setSelected(stamp.id);
          }}
          onCancel={() => setAddingTo(null)}
        />
      ) : null}

      {openDay ? (
        <DayPage
          date={openDay.date}
          fromRect={openDay.rect}
          dayNumber={Number(openDay.date.slice(8))}
          selected={selected}
          onSelect={setSelected}
          onAddStamp={() => setAddingTo(openDay.date)}
          onClose={closeDay}
        />
      ) : null}
    </main>
  );
}
