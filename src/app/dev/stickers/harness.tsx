"use client";

// Dev-only harness for the M7 sticker layer (Tier-2, owner-run — ideally on a real phone).
//
// It seeds the tray with synthetic alpha-PNG stickers (real Dexie rows + real thumb blobs, so
// the real StickerLayer renders through the real seams), draws the real day-grid box in both
// view widths, and shows the live object-URL count — flip the month back and forth and the count
// must return to its baseline, and equal the number of DISTINCT tray assets on the month, not
// the number of placed stickers.
//
// What only a thumb can prove (the gate):
//   · long-press selects (blue glow) · drag / pinch / twist · 45° snap on release
//   · a selected sticker's pinch does NOT switch the view; its drag does NOT scroll the month
//   · an UNSELECTED sticker does not steal a tap from the day underneath it
//   · ✕ + Undo · nothing can be pushed outside the grid box
//   · **SHARPNESS** (the one open knob): if a sticker at MAX_SCALE looks mushy on a real phone,
//     the fix is a one-line switch to `getCloseupUrls` in `useMonthStickers`.

import { useCallback, useEffect, useState } from "react";

import { yearMonthKey } from "@/lib/calendar/month-grid";
import { StickerLayer } from "@/components/sticker/StickerLayer";
import { StickerTray } from "@/components/sticker/StickerTray";
import { db } from "@/lib/db";
import { placeSticker } from "@/lib/db/mutations";
import { useMonthStickers, useTray } from "@/lib/db/queries";
import type { ImageRow, StickerAsset } from "@/lib/db/types";
import { getLiveThumbUrlCount } from "@/lib/image/thumb-url";
import { gridHeight } from "@/lib/sticker/layout";
import { STICKER } from "@/lib/sticker/place";

const SEED_USER = "dev-seed";
const SEEDS = [
  { id: "dev-sticker-1", hue: 340, seeded: true },
  { id: "dev-sticker-2", hue: 190, seeded: true },
  { id: "dev-sticker-3", hue: 90, seeded: false },
];

/** A 512×512 alpha PNG with genuinely transparent corners — a real sticker's shape. */
async function paintSticker(hue: number, label: string): Promise<Blob> {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext("2d")!;
  ctx.clearRect(0, 0, 512, 512); // the corners stay transparent — that is the point
  ctx.beginPath();
  ctx.arc(256, 256, 230, 0, Math.PI * 2);
  ctx.fillStyle = `hsl(${hue} 75% 65%)`;
  ctx.fill();
  ctx.lineWidth = 16;
  ctx.strokeStyle = "white";
  ctx.stroke();
  ctx.fillStyle = "white";
  ctx.font = "bold 160px system-ui";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, 256, 256);
  return new Promise<Blob>((resolve) => c.toBlob((b) => resolve(b!), "image/png"));
}

export function StickerHarness() {
  const [ready, setReady] = useState(false);
  const [gridW, setGridW] = useState(700);
  const [year, setYear] = useState(2026);
  const [month, setMonth] = useState(7);
  const [selected, setSelected] = useState<string | null>(null);
  const [trayOpen, setTrayOpen] = useState(false);
  const [urlCount, setUrlCount] = useState(0);

  const { stickers } = useMonthStickers(year, month);
  const tray = useTray();

  // Seed the tray with real rows + real blobs, so every seam below is the real one.
  useEffect(() => {
    void (async () => {
      for (const seed of SEEDS) {
        if (await db.sticker_assets.get(seed.id)) continue;
        const blob = await paintSticker(seed.hue, seed.id.slice(-1));
        const now = new Date().toISOString();

        const image: ImageRow = {
          id: seed.id,
          user_id: SEED_USER,
          storage_path: `${SEED_USER}/${seed.id}.png`,
          thumb_path: `${SEED_USER}/${seed.id}_thumb.png`,
          width: 512,
          height: 512,
          mime: "image/png",
          byte_size: blob.size,
          created_at: now,
        };
        const asset: StickerAsset = {
          id: seed.id,
          user_id: SEED_USER,
          image_id: seed.id,
          is_seeded: seed.seeded,
          created_at: now,
          updated_at: now,
          deleted_at: null,
        };

        await db.images.put(image);
        await db.image_blobs.put({
          id: seed.id,
          original: null,
          main: blob,
          thumb: blob,
          kind: "sticker",
          createdAt: Date.now(),
        });
        await db.sticker_assets.put(asset);
      }
      setReady(true);
    })();
  }, []);

  // The ALG-6 canary readout: this must come back to its baseline every time the month changes.
  useEffect(() => {
    const t = setInterval(() => setUrlCount(getLiveThumbUrlCount()), 300);
    return () => clearInterval(t);
  }, []);

  const place = useCallback(
    async (asset: { id: string; image_id: string }) => {
      setTrayOpen(false);
      const placed = await placeSticker(
        yearMonthKey(year, month),
        asset.image_id,
        asset.id,
        { x: 0.5, y: 0.5 },
      );
      if (placed) setSelected(placed.id);
    },
    [year, month],
  );

  const reset = useCallback(async () => {
    await db.placed_stickers.clear();
    setSelected(null);
  }, []);

  const distinctAssets = new Set(stickers.map((s) => s.image_id)).size;

  return (
    <main className="min-h-svh bg-page p-4 text-ink">
      <h1 className="font-title text-xl">M7 — sticker layer harness</h1>

      <div className="my-3 flex flex-wrap items-center gap-2 text-sm">
        <button
          type="button"
          onClick={() => setTrayOpen(true)}
          className="rounded-control border border-line bg-paper px-3 py-1"
        >
          Open tray ({tray.assets.length})
        </button>
        <button
          type="button"
          onClick={() => setGridW((w) => (w === 700 ? 1400 : 700))}
          className="rounded-control border border-line bg-paper px-3 py-1"
        >
          Grid width: {gridW}px {gridW === 700 ? "(full-month-ish)" : "(close-up-ish)"}
        </button>
        <button
          type="button"
          onClick={() => setMonth((m) => (m === 12 ? (setYear((y) => y + 1), 1) : m + 1))}
          className="rounded-control border border-line bg-paper px-3 py-1"
        >
          Next month
        </button>
        <button
          type="button"
          onClick={() => setMonth((m) => (m === 1 ? (setYear((y) => y - 1), 12) : m - 1))}
          className="rounded-control border border-line bg-paper px-3 py-1"
        >
          Prev month
        </button>
        <button
          type="button"
          onClick={() => void reset()}
          className="rounded-control border border-line bg-paper px-3 py-1"
        >
          Clear all stickers
        </button>
      </div>

      <p className="mb-3 text-sm text-ink/70">
        <strong>{yearMonthKey(year, month)}</strong> · placed: {stickers.length} · distinct tray
        assets on this month: {distinctAssets} ·{" "}
        <strong>live object URLs: {urlCount}</strong> (must equal the distinct count, and return
        to it after every month flip) · MAX_SCALE {STICKER.MAX_SCALE} · cap{" "}
        {STICKER.MAX_PER_MONTH}
      </p>

      {/* The day-grid box, drawn to scale. A tap on a "day" logs it — that is isolation case 4:
          an UNSELECTED sticker must not block it. */}
      <div
        className="relative border border-line bg-paper"
        style={{ width: gridW, height: gridHeight(gridW), maxWidth: "100%" }}
      >
        <div
          className="absolute inset-0 grid"
          style={{
            gridTemplateColumns: "repeat(7, 1fr)",
            gridTemplateRows: "repeat(6, 1fr)",
          }}
        >
          {Array.from({ length: 42 }, (_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => console.log(`[harness] day cell ${i} tapped`)}
              className="border border-line-soft text-[10px] text-ink/30"
            >
              {i + 1}
            </button>
          ))}
        </div>

        {ready ? (
          <StickerLayer
            year={year}
            month={month}
            startOfWeek={1}
            gridW={gridW}
            selected={selected}
            onSelect={setSelected}
            onOpenDay={(date) => console.log(`[harness] sticker handed its tap to ${date}`)}
          />
        ) : null}
      </div>

      {trayOpen ? (
        <StickerTray onPick={(asset) => void place(asset)} onClose={() => setTrayOpen(false)} />
      ) : null}
    </main>
  );
}
