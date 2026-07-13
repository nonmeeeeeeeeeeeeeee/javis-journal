"use client";

// The sticker picker (US-9): a BOTTOM SHEET over the calendar, not a route and not a full screen
// — she needs to see the month she is decorating while she picks. Same overlay posture as
// `MonthPicker` / `CalendarMenu`.
//
// The tray is GLOBAL: upload a sticker once, stamp it onto any month. Tap to place (decision 12
// — the placed sticker arrives selected, the same beat as a freshly cut stamp); long-press to
// delete an uploaded one (a seeded one has no delete: the affordance is hidden here and the
// Postgres trigger refuses it anyway). Deleting a tray sticker never touches its already-placed
// instances — they render from their own image.

import { useEffect, useRef, useState } from "react";

import { addTrayAsset, deleteTrayAsset, restoreTrayAsset } from "@/lib/db/mutations";
import { useTray } from "@/lib/db/queries";
import type { StickerAsset } from "@/lib/db/types";
import { ingestImage } from "@/lib/image/ingest";
import { LONG_PRESS_MS } from "@/lib/gestures/machine";
import { UndoToast } from "@/components/day/UndoToast";

export function StickerTray({
  onPick,
  onClose,
}: {
  /** Tap a tray sticker → place it on the month she is looking at. */
  onPick: (asset: StickerAsset) => void;
  onClose: () => void;
}) {
  const { assets, urls, loaded } = useTray();
  const [busy, setBusy] = useState(false);
  const [undo, setUndo] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const onUpload = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      // The same M3 pipeline a photo takes, with `kind: 'sticker'` — which is what keeps the PNG
      // alpha. There is no second image path.
      const imageId = await ingestImage(file, "sticker");
      await addTrayAsset(imageId);
    } catch {
      // A failed decode leaves the tray exactly as it was (ingest is fail-closed).
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end bg-ink/40"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="max-h-[60svh] overflow-y-auto rounded-t-cell bg-paper px-4 pb-6 pt-3 shadow-sm">
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-line" aria-hidden />

        <div className="grid grid-cols-4 gap-3 sm:grid-cols-6">
          <button
            type="button"
            aria-label="Upload a sticker"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
            className="grid aspect-square place-items-center rounded-control border border-dashed border-line text-2xl text-ink disabled:opacity-50"
          >
            {busy ? "…" : "＋"}
          </button>

          {assets.map((asset) => (
            <TrayItem
              key={asset.id}
              asset={asset}
              url={urls.get(asset.image_id)}
              onPick={() => onPick(asset)}
              onDelete={async () => {
                if (await deleteTrayAsset(asset.id)) setUndo(asset.id);
              }}
            />
          ))}
        </div>

        {loaded && assets.length === 0 ? (
          <p className="mt-4 text-center text-sm text-ink/60">
            Your stickers will live here. Tap ＋ to add one.
          </p>
        ) : null}

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => void onUpload(e.target.files?.[0])}
        />
      </div>

      {undo ? (
        <UndoToast
          onUndo={() => {
            void restoreTrayAsset(undo);
            setUndo(null);
          }}
          onDismiss={() => setUndo(null)}
        />
      ) : null}
    </div>
  );
}

/**
 * One tray sticker. Tap places it; a long-press deletes it — but only if she uploaded it. The
 * long-press timer is the tray's own (a two-line affair): the shared machine is about *moving*
 * things on a surface, and a tray thumb doesn't move.
 */
function TrayItem({
  asset,
  url,
  onPick,
  onDelete,
}: {
  asset: StickerAsset;
  url: string | undefined;
  onPick: () => void;
  onDelete: () => void;
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);

  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  useEffect(() => clear, []);

  return (
    <button
      type="button"
      aria-label={asset.is_seeded ? "Seeded sticker" : "Sticker"}
      onPointerDown={() => {
        longPressed.current = false;
        if (asset.is_seeded) return; // a seeded sticker has no delete — nothing to arm
        timer.current = setTimeout(() => {
          longPressed.current = true;
          onDelete();
        }, LONG_PRESS_MS);
      }}
      onPointerUp={clear}
      onPointerLeave={clear}
      onPointerCancel={clear}
      onClick={() => {
        if (longPressed.current) return; // the long-press already deleted it
        onPick();
      }}
      className="grid aspect-square place-items-center rounded-control bg-line-soft p-1"
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt=""
          draggable={false}
          className="max-h-full max-w-full select-none object-contain"
        />
      ) : null}
    </button>
  );
}
