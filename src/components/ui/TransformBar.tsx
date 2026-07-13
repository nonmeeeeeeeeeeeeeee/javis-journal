"use client";

/**
 * The desktop control bar, shared by the day page's stamps and the calendar's stickers (M7 —
 * lifted verbatim out of `DayPage`).
 *
 * A mouse has no second finger, so pinch (scale) and twist (rotate) are simply unreachable — on
 * a fine pointer we surface them as explicit buttons. The ADR's "no ambient handles" rule was
 * about TOUCH (the fat-thumb problem, and chrome cluttering the composition she is arranging);
 * it does not apply to a cursor, and this bar never renders on a phone.
 *
 * It is pinned to the bottom of the surface rather than floating by the selection: a floating
 * cluster gets clipped at the edge and collides with the composition. The ✕ stays on the
 * element (it works on both platforms). The caller gates it on `useFinePointer() && selected`.
 */
export function TransformBar({
  onScale,
  onRotate,
  className = "absolute bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-full bg-paper px-2 py-1 shadow-sm",
}: {
  onScale: (direction: 1 | -1) => void;
  onRotate: (direction: 1 | -1) => void;
  /** Positioning only — the surface decides where its bar sits. */
  className?: string;
}) {
  return (
    <div className={className}>
      <BarButton label="Smaller" onClick={() => onScale(-1)}>
        −
      </BarButton>
      <BarButton label="Bigger" onClick={() => onScale(1)}>
        +
      </BarButton>
      <span className="mx-1 h-6 w-px bg-line" />
      <BarButton label="Rotate left" onClick={() => onRotate(-1)}>
        ⟲
      </BarButton>
      <BarButton label="Rotate right" onClick={() => onRotate(1)}>
        ⟳
      </BarButton>
    </div>
  );
}

export function BarButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="grid h-10 w-10 place-items-center rounded-full text-lg text-ink hover:bg-line-soft"
    >
      {children}
    </button>
  );
}
