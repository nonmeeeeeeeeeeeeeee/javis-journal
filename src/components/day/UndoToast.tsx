"use client";

import { useEffect } from "react";

/**
 * "Deleted — Undo" (decision 13). Non-modal, bottom-center, ~6s, single-level (the most recent
 * delete only). The delete itself is already durable when this appears — Undo is a *newer* write
 * that wins by LWW, never a deferred one that a tab-kill could silently resurrect.
 */
export function UndoToast({
  onUndo,
  onDismiss,
  timeoutMs = 6000,
}: {
  onUndo: () => void;
  onDismiss: () => void;
  timeoutMs?: number;
}) {
  useEffect(() => {
    const t = setTimeout(onDismiss, timeoutMs);
    return () => clearTimeout(t);
  }, [onDismiss, timeoutMs]);

  return (
    <div
      role="status"
      className="pointer-events-auto absolute bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-control bg-ink px-4 py-2 text-sm text-paper shadow-sm"
    >
      <span>Deleted</span>
      <button
        type="button"
        onClick={onUndo}
        className="font-semibold uppercase tracking-wide text-today-bg"
      >
        Undo
      </button>
    </div>
  );
}
