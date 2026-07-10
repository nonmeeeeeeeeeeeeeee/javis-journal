"use client";

import { useEffect, useState } from "react";

import {
  currentYearMonth,
  isMonthInBounds,
  MONTH_NAMES,
  monthBounds,
  type YearMonth,
} from "@/lib/calendar/month-grid";

const MONTH_ABBR = MONTH_NAMES.map((m) => m.slice(0, 3));

/**
 * Change-month overlay (US-5): a year stepper `‹ 2026 ›` above a 3×4 grid of months,
 * bounded to `[July 2026, current real month]`. Year arrows disable at the bounds and
 * out-of-range months render disabled. The current real month and the currently
 * viewed month get distinct highlights. Navigation stays put — this is client state,
 * never the URL.
 */
export function MonthPicker({
  onClose,
  viewed,
  onPick,
}: {
  onClose: () => void;
  viewed: YearMonth;
  onPick: (ym: YearMonth) => void;
}) {
  // Mounted only while open (parent gates with `{pickerOpen && …}`), so this
  // initializer re-anchors the stepper on the viewed year each time it opens.
  const [pickerYear, setPickerYear] = useState(viewed.year);
  const { min, max } = monthBounds();
  const current = currentYearMonth();

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const canPrevYear = pickerYear - 1 >= min.year;
  const canNextYear = pickerYear + 1 <= max.year;

  return (
    <div
      className="fixed inset-0 z-30 grid place-items-center bg-ink/30 p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Change month"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xs rounded-card border border-line bg-paper p-5 shadow-[0_18px_48px_rgba(88,74,58,0.18)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <StepButton
            label="Previous year"
            disabled={!canPrevYear}
            onClick={() => setPickerYear((y) => y - 1)}
          >
            ‹
          </StepButton>
          <span className="font-title text-2xl font-medium text-ink">{pickerYear}</span>
          <StepButton
            label="Next year"
            disabled={!canNextYear}
            onClick={() => setPickerYear((y) => y + 1)}
          >
            ›
          </StepButton>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {MONTH_ABBR.map((label, i) => {
            const m = i + 1;
            const inRange = isMonthInBounds(pickerYear, m);
            const isCurrent = pickerYear === current.year && m === current.month;
            const isViewed = pickerYear === viewed.year && m === viewed.month;

            const tone = isCurrent
              ? "bg-today-bg text-today-ink"
              : isViewed
                ? "border border-accent bg-accent-soft text-ink"
                : "border border-line bg-paper text-ink";

            return (
              <button
                key={label}
                type="button"
                disabled={!inRange}
                onClick={() => {
                  onPick({ year: pickerYear, month: m });
                  onClose();
                }}
                className={`rounded-control px-2 py-2 text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${tone}`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function StepButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="grid size-9 place-items-center rounded-control border border-line bg-paper text-xl text-ink disabled:cursor-not-allowed disabled:opacity-30"
    >
      {children}
    </button>
  );
}
