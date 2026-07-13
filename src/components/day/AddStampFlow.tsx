"use client";

// The add-a-stamp flow (US-7, US-8): OS photo picker → the punch machine (full-screen) → cut →
// the stamp is placed on the day. Cancelling at ANY step writes nothing — the `entries` row is
// only created atomically with the first `stamps` row (see createStampOnDay).
//
// It owns nothing but the transient File: the picker fires as soon as it mounts, so tapping an
// empty day goes straight to the OS sheet (US-7, literally) with no empty day page in between.

import { useCallback, useEffect, useRef, useState } from "react";

import { Stamper } from "@/components/Stamper";
import { createStampOnDay } from "@/lib/db/mutations";
import type { Stamp } from "@/lib/db/types";
import type { MaskId } from "@/lib/stamp/masks";

export type AddStampFlowProps = {
  /** The day being added to (`YYYY-MM-DD`). */
  date: string;
  /** The stamp landed: the day page opens (or updates) with it placed, on top, and selected. */
  onPlaced: (stamp: Stamp) => void;
  /** Cancelled (picker dismissed or the machine backed out) — nothing was written. */
  onCancel: () => void;
};

export function AddStampFlow({ date, onPlaced, onCancel }: AddStampFlowProps) {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Open the OS picker the moment the flow starts, and end the flow if she dismisses it.
  // (`cancel` fires on Chromium 121+ / Safari 17+; elsewhere the flow just idles until she
  // taps again — nothing has been written either way.)
  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    const onDismiss = () => onCancel();
    input.addEventListener("cancel", onDismiss);
    input.click();
    return () => input.removeEventListener("cancel", onDismiss);
  }, [onCancel]);

  const onPick = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const picked = event.target.files?.[0];
      event.target.value = "";
      // A dismissed picker fires `change` with no file on some platforms and nothing at all on
      // others; the backdrop-less flow simply ends when it does.
      if (!picked) {
        onCancel();
        return;
      }
      setFile(picked);
    },
    [onCancel],
  );

  const onConfirm = useCallback(
    async (imageId: string, maskType: MaskId) => {
      try {
        const stamp = await createStampOnDay(date, imageId, maskType);
        if (!stamp) {
          // The 3-cap (a second device raced us). Nothing was written.
          onCancel();
          return;
        }
        onPlaced(stamp);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [date, onPlaced, onCancel],
  );

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onPick}
      />

      {file ? (
        <div className="fixed inset-0 z-50 bg-page">
          <Stamper
            key={`${file.name}:${file.size}:${file.lastModified}`}
            file={file}
            onConfirm={(id, mask) => void onConfirm(id, mask)}
            onCancel={onCancel}
          />
          {error ? (
            <p className="absolute inset-x-4 bottom-4 rounded-control bg-paper p-3 text-center text-sm text-accent shadow-sm">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
