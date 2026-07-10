"use client";

import { useRef } from "react";

import { MONTH_NAMES } from "@/lib/calendar/month-grid";

const LONG_PRESS_MS = 500;
const MOVE_TOLERANCE = 10; // px of finger drift before we cancel the long-press

/**
 * The "Month Year" heading. A **touch long-press** (≥500ms) fires `onLongPress` —
 * the touch path to the month picker. A short tap does nothing (desktop opens the
 * picker from the 3-dots menu instead). Non-touch pointers never arm the timer.
 */
export function MonthTitle({
  year,
  month,
  onLongPress,
}: {
  year: number;
  month: number;
  onLongPress?: () => void;
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);

  function clear() {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    origin.current = null;
  }

  function onPointerDown(e: React.PointerEvent) {
    if (e.pointerType !== "touch" || !onLongPress) return;
    origin.current = { x: e.clientX, y: e.clientY };
    timer.current = setTimeout(() => {
      timer.current = null;
      onLongPress();
    }, LONG_PRESS_MS);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!origin.current) return;
    const dx = Math.abs(e.clientX - origin.current.x);
    const dy = Math.abs(e.clientY - origin.current.y);
    if (dx > MOVE_TOLERANCE || dy > MOVE_TOLERANCE) clear();
  }

  return (
    <h1
      className="select-none text-center font-title text-4xl font-medium text-ink [touch-action:none]"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={clear}
      onPointerCancel={clear}
      onPointerLeave={clear}
    >
      {MONTH_NAMES[month - 1]} {year}
    </h1>
  );
}
