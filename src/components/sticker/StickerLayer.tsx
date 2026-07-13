"use client";

// The month's sticker layer (US-9): a decoration layer rendered INSIDE the day-grid box of both
// calendar views, in grid-normalized coordinates, above the day cells. Because it lives inside
// the grid, it scrolls with the close-up grid for free and lands in the same place relative to
// the calendar in either view.
//
// SELECTION IS WHAT MAKES THIS SAFE (M7 decision 3). The calendar underneath already owns both
// gestures a sticker wants — one finger scrolls the close-up month, two fingers switch the view:
//
//   · Nothing selected → the layer root is `pointer-events: none`, so a tap on empty layer space
//     goes straight to the day cell underneath. Only the sticker boxes take events (they must —
//     a long-press has to be able to select one), and they keep `touch-action: pan-x` so a drag
//     across a sticker still scrolls the month, and they never stop propagation so a two-finger
//     pinch still reaches the Calendar's pinch-to-switch. A short tap on an unselected sticker is
//     handed back to the day underneath (`dateAtGridPoint`).
//   · A sticker selected → the root arms itself: it takes pointer events, sets
//     `touch-action: none`, and stops touch events from reaching the calendar. Now a drag moves
//     the sticker (it does not scroll the month), a pinch scales it (it does not switch the
//     view), and a wheel scales it (it does not scroll the scroller). Calendar ALSO no-ops its
//     pinch handler off `stickerSelectedRef` — belt and braces, the same pattern M6 used for the
//     open day page.
//
// Editing is M6's model, running M6's code: the shared `TransformGestures` machine, one write per
// gesture, on gesture-end.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  deletePlacedSticker,
  restorePlacedSticker,
  updatePlacedSticker,
} from "@/lib/db/mutations";
import { useMonthStickers } from "@/lib/db/queries";
import type { RotationDeg } from "@/lib/db/types";
import type { LiveTransform } from "@/lib/gestures/machine";
import { dateAtGridPoint } from "@/lib/sticker/cell";
import { StickerGestures } from "@/lib/sticker/gestures";
import { applyLive, gridHeight, stickerBoxes } from "@/lib/sticker/layout";
import { toggleFrontBack } from "@/lib/sticker/place";
import { useFinePointer } from "@/lib/ui/pointer";
import { TransformBar } from "@/components/ui/TransformBar";
import { UndoToast } from "@/components/day/UndoToast";

const DELETE_SIZE = 40;
const DELETE_OFFSET = 6;

/**
 * The layer's own chrome (the ✕, the desktop bar, the Undo toast) lives INSIDE the gesture
 * surface — unlike the day page's, which sits outside it. So a press on a button would otherwise
 * bubble into the machine, hit-test as "empty space", and **deselect** on pointer-up… which
 * lands *before* the click, leaving the click to act on nothing. (That is why rotating with the
 * keyboard worked while the bar's ⟲ ⟳ did not: the keyboard never goes through the machine.)
 *
 * So: chrome swallows its pointer events, and the machine never sees them.
 */
const CHROME = {
  onPointerDown: (e: React.PointerEvent) => e.stopPropagation(),
  onPointerMove: (e: React.PointerEvent) => e.stopPropagation(),
  onPointerUp: (e: React.PointerEvent) => e.stopPropagation(),
} as const;

export type StickerLayerProps = {
  year: number;
  month: number;
  startOfWeek: number;
  /** The day-grid box's width in px (`7 × cellW`) — the coordinate box stickers are normalized to. */
  gridW: number;
  selected: string | null;
  onSelect: (id: string | null) => void;
  /** A tap on an UNSELECTED sticker belongs to the day underneath it, not to the sticker. */
  onOpenDay: (date: string) => void;
};

export function StickerLayer({
  year,
  month,
  startOfWeek,
  gridW,
  selected,
  onSelect,
  onOpenDay,
}: StickerLayerProps) {
  const { stickers, urls, aspects } = useMonthStickers(year, month);
  const fine = useFinePointer();
  const [live, setLive] = useState<LiveTransform | null>(null);
  const [undo, setUndo] = useState<{ id: string; layer_order: number } | null>(null);

  const rootRef = useRef<HTMLDivElement>(null);
  const gesturesRef = useRef<StickerGestures | null>(null);
  // The machine outlives every render; this is how it reads the CURRENT stickers and callbacks
  // without being rebuilt (and without touching a ref during render).
  const ctxRef = useRef({ stickers, selected, onSelect, onOpenDay, startOfWeek, gridW });
  // Where the last pointer went down, in grid pixels — a tap on an unselected sticker needs the
  // POINT (to find the day underneath), and the machine only reports the id.
  const lastPointRef = useRef({ x: 0, y: 0 });

  const gridH = gridHeight(gridW);
  const boxes = useMemo(
    () => (gridW > 0 ? stickerBoxes(stickers, aspects, gridW) : []),
    [stickers, aspects, gridW],
  );

  useEffect(() => {
    const g = new StickerGestures({
      onChange: setLive,
      // Exactly ONE write per gesture, on gesture-end — never per animation frame.
      onCommit: (t) =>
        void updatePlacedSticker(t.id, {
          pos_x: t.pos_x,
          pos_y: t.pos_y,
          scale: t.scale,
          rotation_deg: t.rotation_deg as RotationDeg,
        }),
      onTap: (id) => {
        const ctx = ctxRef.current;
        if (ctx.selected === id) {
          // Front/back is only reachable on a SELECTED sticker (decision 14) — an unselected
          // sticker's tap is not the sticker's to take.
          void updatePlacedSticker(id, {
            layer_order: toggleFrontBack(ctx.stickers, id),
          });
          return;
        }
        const date = dateAtGridPoint(
          lastPointRef.current,
          ctx.gridW,
          year,
          month,
          ctx.startOfWeek,
        );
        if (date) ctx.onOpenDay(date);
      },
      onSelect: (id) => ctxRef.current.onSelect(id),
      onDeselect: () => ctxRef.current.onSelect(null),
    });
    gesturesRef.current = g;
    return () => {
      g.cancel();
      gesturesRef.current = null;
    };
  }, [year, month]);

  useEffect(() => {
    ctxRef.current = { stickers, selected, onSelect, onOpenDay, startOfWeek, gridW };
    gesturesRef.current?.setContext(boxes, gridW, selected);
  }, [stickers, selected, onSelect, onOpenDay, startOfWeek, boxes, gridW]);

  // Selection can't survive a month change (the sticker isn't on this month) or a view switch's
  // remeasure — clearing it also disarms the layer, handing the calendar back its gestures.
  useEffect(() => {
    onSelect(null);
    // Only on an actual month change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month]);

  const localPoint = useCallback((e: React.PointerEvent) => {
    const rect = rootRef.current?.getBoundingClientRect();
    const p = {
      x: e.clientX - (rect?.left ?? 0),
      y: e.clientY - (rect?.top ?? 0),
    };
    lastPointRef.current = p;
    return p;
  }, []);

  const onDelete = useCallback(async () => {
    if (!selected) return;
    const layerOrder = await deletePlacedSticker(selected);
    onSelect(null);
    if (layerOrder !== null) setUndo({ id: selected, layer_order: layerOrder });
  }, [selected, onSelect]);

  // The wheel scales the selected sticker. `preventDefault` is load-bearing here in a way it
  // was not on the day page: an un-prevented wheel over the close-up scroller would scroll the
  // month out from under her instead of scaling the sticker.
  useEffect(() => {
    const el = rootRef.current;
    if (!el || !selected) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      gesturesRef.current?.wheel(e.deltaY);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [selected]);

  // Keyboard, bound only while a sticker is selected. Escape deselects and Delete deletes — the
  // two a mouse otherwise has no way to reach.
  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => {
      const g = gesturesRef.current;
      if (!g) return;
      switch (e.key) {
        case "Escape":
          onSelect(null);
          break;
        case "ArrowLeft":
          g.rotateStep(-1);
          break;
        case "ArrowRight":
          g.rotateStep(1);
          break;
        case "+":
        case "=":
          g.scaleStep(1);
          break;
        case "-":
        case "_":
          g.scaleStep(-1);
          break;
        case "Delete":
        case "Backspace":
          void onDelete();
          break;
        default:
          return;
      }
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, onSelect, onDelete]);

  const pointerHandlers = {
    onPointerDown: (e: React.PointerEvent) => {
      const p = localPoint(e);
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      gesturesRef.current?.pointerDown(e.pointerId, p);
    },
    onPointerMove: (e: React.PointerEvent) =>
      gesturesRef.current?.pointerMove(e.pointerId, localPoint(e)),
    onPointerUp: (e: React.PointerEvent) => gesturesRef.current?.pointerUp(e.pointerId),
    onPointerCancel: (e: React.PointerEvent) => gesturesRef.current?.pointerUp(e.pointerId),
  };

  const liveFor = (id: string) => (live && live.id === id ? live : null);
  const selectedBox = boxes.find((b) => b.id === selected) ?? null;
  const selectedLive = selectedBox
    ? applyLive(selectedBox, liveFor(selectedBox.id), gridW)
    : null;

  if (gridW <= 0) return null;

  return (
    <div
      ref={rootRef}
      data-testid="sticker-layer"
      // Armed only while a sticker is selected. Unarmed, the layer is invisible to the pointer,
      // so the calendar behaves EXACTLY as it does with no stickers on it at all.
      className={`absolute left-0 top-0 z-10 isolate ${
        selected ? "pointer-events-auto [touch-action:none]" : "pointer-events-none"
      }`}
      style={{ width: gridW, height: gridH }}
      {...(selected
        ? {
            ...pointerHandlers,
            // Belt: a two-finger gesture in here must never reach the calendar's
            // pinch-to-switch. (Braces: Calendar's handler also no-ops off stickerSelectedRef.)
            onTouchStart: (e: React.TouchEvent) => e.stopPropagation(),
            onTouchMove: (e: React.TouchEvent) => e.stopPropagation(),
            onTouchEnd: (e: React.TouchEvent) => e.stopPropagation(),
          }
        : {})}
    >
      {boxes.map((box) => {
        const b = applyLive(box, liveFor(box.id), gridW);
        const url = urls.get(box.image_id);
        if (!url) return null;
        return (
          // Local object-URL / signed 256px thumb from getThumbUrls (ALG-6 — released when the
          // month unmounts). While nothing is selected each sticker is its own pointer target
          // (that is how a long-press can select it) and keeps `pan-x`, so a one-finger drag
          // across it still scrolls the close-up month.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={box.id}
            src={url}
            alt=""
            draggable={false}
            data-sticker-id={box.id}
            className={`absolute origin-center select-none ${
              selected ? "pointer-events-none" : "pointer-events-auto [touch-action:pan-x]"
            }`}
            style={{
              left: b.x,
              top: b.y,
              width: b.w,
              height: b.h,
              zIndex: b.z,
              transform: `rotate(${b.rot}deg)`,
              filter:
                box.id === selected
                  ? "drop-shadow(0 0 6px rgb(59 130 246 / 0.95)) drop-shadow(0 6px 16px rgb(59 130 246 / 0.6))"
                  : "drop-shadow(0 1px 3px rgb(0 0 0 / 0.18))",
            }}
            {...(selected ? {} : pointerHandlers)}
          />
        );
      })}

      {/* Delete: the same floating ✕ the day page uses, just off the selection's corner so it
          never blocks a pinch. At most one on screen. */}
      {selectedLive ? (
        <button
          type="button"
          aria-label="Delete sticker"
          {...CHROME}
          onClick={() => void onDelete()}
          className="absolute z-30 grid place-items-center rounded-full bg-paper text-base font-bold text-ink shadow-sm"
          style={{
            width: DELETE_SIZE,
            height: DELETE_SIZE,
            left: Math.max(
              0,
              Math.min(gridW - DELETE_SIZE, selectedLive.x + selectedLive.w + DELETE_OFFSET),
            ),
            top: Math.max(
              0,
              Math.min(gridH - DELETE_SIZE, selectedLive.y - DELETE_OFFSET - DELETE_SIZE),
            ),
          }}
        >
          ✕
        </button>
      ) : null}

      {undo ? (
        <div {...CHROME} className="pointer-events-none fixed inset-x-0 bottom-0 z-50">
          <UndoToast
            onUndo={() => {
              void restorePlacedSticker(undo.id, undo.layer_order);
              onSelect(undo.id);
              setUndo(null);
            }}
            onDismiss={() => setUndo(null)}
          />
        </div>
      ) : null}

      {/* Desktop: a mouse cannot pinch or twist. The shared bar — the same one the day page
          renders — is `fixed` here because the layer scrolls with the close-up grid, and a bar
          that slides off-screen with it would be useless. */}
      {fine && selected ? (
        <div {...CHROME} className="contents">
          <TransformBar
            onScale={(d) => gesturesRef.current?.scaleStep(d)}
            onRotate={(d) => gesturesRef.current?.rotateStep(d)}
            className="pointer-events-auto fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-full bg-paper px-2 py-1 shadow-sm"
          />
        </div>
      ) : null}
    </div>
  );
}

/**
 * The center of the **visible** part of the grid, in normalized grid coords — where a tapped
 * tray sticker lands (decision 13). In the close-up the grid is a wide scroller, so dropping a
 * sticker at grid-center while she is scrolled to the far column would place it off-screen and
 * read as "the tap did nothing". In full-month the two coincide, so it costs nothing there.
 *
 * Lives here (not in the pure layer) because it is the one thing that must ask the DOM where the
 * grid currently is; `fromGridPixels` does the actual mapping.
 */
export function visibleGridCenter(el: HTMLElement): { x: number; y: number } {
  const r = el.getBoundingClientRect();
  const left = Math.max(0, r.left);
  const right = Math.min(window.innerWidth, r.right);
  const top = Math.max(0, r.top);
  const bottom = Math.min(window.innerHeight, r.bottom);
  // Fall back to the grid's own center if it is entirely off-screen (it never is in practice).
  const cx = right > left ? (left + right) / 2 - r.left : r.width / 2;
  const cy = bottom > top ? (top + bottom) / 2 - r.top : r.height / 2;
  return { x: r.width > 0 ? cx / r.width : 0.5, y: r.height > 0 ? cy / r.height : 0.5 };
}
