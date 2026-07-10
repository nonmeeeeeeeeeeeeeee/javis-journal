"use client";

/**
 * Floating top bar: a sticker button (visible but **inert** in M4 — M7 wires it to
 * the tray) and the 3-dots menu trigger. The sticker glyph is an inline SVG line
 * icon (rounded square with a peeled corner), stroked in `currentColor` so it
 * inherits the `ink` token and matches the 3-dots weight — not the prototype emoji.
 */
export function TopBar({ onMenu }: { onMenu?: () => void }) {
  return (
    <div className="pointer-events-none absolute inset-x-4 top-3 z-10 flex items-center justify-between">
      <button
        type="button"
        aria-label="Stickers"
        className="pointer-events-auto grid size-11 place-items-center rounded-control border border-line bg-paper text-ink shadow-sm"
      >
        <StickerIcon />
      </button>
      <button
        type="button"
        aria-label="Menu"
        onClick={onMenu}
        className="pointer-events-auto grid size-11 place-items-center rounded-control border border-line bg-paper text-ink shadow-sm"
      >
        <span className="grid gap-1" aria-hidden>
          <span className="block size-1 rounded-full bg-ink" />
          <span className="block size-1 rounded-full bg-ink" />
          <span className="block size-1 rounded-full bg-ink" />
        </span>
      </button>
    </div>
  );
}

function StickerIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {/* Rounded-square body with the bottom-right corner cut on the fold diagonal. */}
      <path d="M6 3h12a2 2 0 0 1 2 2v7l-8 8H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
      {/* The peeled/folded corner. */}
      <path d="M20 12h-6a2 2 0 0 0-2 2v6" />
    </svg>
  );
}
