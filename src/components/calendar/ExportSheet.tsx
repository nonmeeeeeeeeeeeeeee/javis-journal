"use client";

// M9 — the export bottom sheet (US-12). Same overlay posture as the M7 sticker tray / the
// calendar menu: a sheet over the calendar so she keeps seeing the month she is saving. One
// choice (include the month/year title band, default ON — a per-export taste, not worth a
// persisted profile field) and one Save button that renders the PNG on tap and hands it to the
// share sheet / download. No live preview: the PNG *is* the month she is looking at.
//
// Async states (decision 13): the button becomes "Preparing…" and disabled while the blob is
// built (also the double-tap guard); on success the sheet closes; a total failure keeps the sheet
// open with an inline retry message. An empty month exports fine — a blank framed calendar with
// day numbers is a valid keepsake.

import { useEffect, useState } from "react";

import type { SelectedFrame } from "@/lib/db/types";
import { exportMonthPng } from "@/lib/export/exportMonthPng";

export function ExportSheet({
  year,
  month,
  weekStart,
  frame,
  onClose,
}: {
  /** The VIEWED month — Calendar's `{year, month}` state, never `todayISO()`. */
  year: number;
  month: number;
  weekStart: number;
  frame: SelectedFrame;
  onClose: () => void;
}) {
  const [includeTitle, setIncludeTitle] = useState(true);
  const [status, setStatus] = useState<"idle" | "preparing" | "error">("idle");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const preparing = status === "preparing";

  const onSave = async () => {
    if (preparing) return; // double-tap guard
    setStatus("preparing");
    try {
      await exportMonthPng(year, month, weekStart, frame, includeTitle);
      onClose();
    } catch {
      setStatus("error");
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end bg-ink/40"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="rounded-t-cell bg-paper px-4 pb-6 pt-3 shadow-sm"
        role="dialog"
        aria-label="Download month as image"
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-line" aria-hidden />

        <h2 className="mb-3 text-center font-title text-lg text-ink">Download this month</h2>

        <button
          type="button"
          role="switch"
          aria-checked={includeTitle}
          disabled={preparing}
          onClick={() => setIncludeTitle((v) => !v)}
          className="flex w-full items-center justify-between rounded-control border border-line px-4 py-3 text-left text-sm font-semibold text-ink disabled:opacity-60"
        >
          <span>Include the month title</span>
          <span
            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
              includeTitle ? "bg-accent" : "bg-line"
            }`}
            aria-hidden
          >
            <span
              className={`absolute top-0.5 size-5 rounded-full bg-paper transition-all ${
                includeTitle ? "left-[1.375rem]" : "left-0.5"
              }`}
            />
          </span>
        </button>

        {status === "error" ? (
          <p className="mt-3 text-center text-sm text-accent">
            Couldn&apos;t create the image — try again.
          </p>
        ) : null}

        <button
          type="button"
          disabled={preparing}
          onClick={() => void onSave()}
          className="mt-4 w-full rounded-control bg-accent px-4 py-3 text-center text-sm font-bold text-ink transition-opacity disabled:opacity-60"
        >
          {preparing ? "Preparing…" : "Save image"}
        </button>
      </div>
    </div>
  );
}
