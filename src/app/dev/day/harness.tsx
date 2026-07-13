"use client";

// Dev-only harness for the M6 day editor (Tier-2, owner-run — ideally on a real phone).
//
// It seeds a day with 1/2/3 synthetic stamps (real Dexie rows + real closeup/thumb blobs, so
// the real DayPage renders through the real seams), opens the real overlay, and shows the live
// object-URL count — open and close the day 50× and the count must return to its baseline.
//
// What only a thumb can prove (the gate): long-press selects · drag / pinch / twist · 45° snap
// on release · tap = front/back · ✕ + Undo · nothing pushed off the page · the + FAB gone at 3.

import { useCallback, useEffect, useState } from "react";

import { DayPage } from "@/components/day/DayPage";
import { db } from "@/lib/db";
import type { ImageBlobRow } from "@/lib/db/image-types";
import { useDayView } from "@/lib/db/queries";
import type { Entry, ImageRow, MaskType, Stamp } from "@/lib/db/types";
import { placeStamp } from "@/lib/day/place";
import { getLiveThumbUrlCount } from "@/lib/image/thumb-url";
import { todayISO } from "@/lib/calendar/month-grid";

const SEED_USER = "dev-seed";
const DATE = todayISO();
const ENTRY_ID = `dev-day-${DATE}`;

const SHAPES: { mask: MaskType; hue: number; w: number; h: number }[] = [
  { mask: "postage", hue: 20, w: 768, h: 1024 }, // 3:4 portrait
  { mask: "cloud", hue: 200, w: 1024, h: 731 }, // 1.4 landscape
  { mask: "heart", hue: 330, w: 1024, h: 1024 }, // 1:1
];

async function paint(w: number, h: number, hue: number, label: string): Promise<Blob> {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = `hsl(${hue} 70% 70%)`;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.font = `bold ${Math.round(Math.min(w, h) * 0.4)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, w / 2, h / 2);
  return new Promise<Blob>((resolve) => c.toBlob((b) => resolve(b!), "image/webp", 0.8));
}

/** Seed the day with exactly `count` stamps, placed through the real ALG-8. */
async function seed(count: number): Promise<void> {
  const now = new Date().toISOString();
  await db.stamps.where("entry_id").equals(ENTRY_ID).delete();

  const entry: Entry = {
    id: ENTRY_ID,
    user_id: SEED_USER,
    entry_date: DATE,
    created_at: now,
    updated_at: now,
  };
  await db.entries.put(entry);

  const placed: Stamp[] = [];
  for (let i = 0; i < count; i++) {
    const shape = SHAPES[i % SHAPES.length];
    const id = `dev-img-${DATE}-${i}`;
    const main = await paint(shape.w, shape.h, shape.hue, String(i + 1));
    const thumb = await paint(
      Math.round((shape.w / Math.max(shape.w, shape.h)) * 256),
      Math.round((shape.h / Math.max(shape.w, shape.h)) * 256),
      shape.hue,
      String(i + 1),
    );

    const image: ImageRow = {
      id,
      user_id: SEED_USER,
      storage_path: `${SEED_USER}/${id}.webp`,
      thumb_path: `${SEED_USER}/${id}-thumb.webp`,
      width: shape.w,
      height: shape.h,
      mime: "image/webp",
      byte_size: main.size,
      created_at: now,
    };
    const blob: ImageBlobRow = {
      id,
      original: null,
      main,
      thumb,
      kind: "stamp",
      createdAt: Date.now(),
    };

    const placement = placeStamp(placed, shape.w / shape.h);
    if (!placement) break; // the 3-cap
    const stamp: Stamp = {
      id: `dev-stamp-${DATE}-${i}`,
      entry_id: ENTRY_ID,
      user_id: SEED_USER,
      image_id: id,
      mask_type: shape.mask,
      ...placement,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    };

    await db.images.put(image);
    await db.image_blobs.put(blob);
    await db.stamps.put(stamp);
    placed.push(stamp);
  }
}

export function DayHarness() {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [urlCount, setUrlCount] = useState(0);
  const [opens, setOpens] = useState(0);
  const [busy, setBusy] = useState(false);
  const view = useDayView(open ? DATE : null);

  useEffect(() => {
    const id = setInterval(() => setUrlCount(getLiveThumbUrlCount()), 400);
    return () => clearInterval(id);
  }, []);

  const reseed = useCallback(async (count: number) => {
    setBusy(true);
    setOpen(false);
    setSelected(null);
    await seed(count);
    setBusy(false);
  }, []);

  const openDay = () => {
    setOpens((n) => n + 1);
    setOpen(true);
  };

  return (
    <main className="min-h-svh bg-page p-6 text-ink">
      <h1 className="font-title text-2xl">M6 day-editor harness</h1>
      <p className="mt-1 max-w-prose text-sm text-muted">
        Dev-only. Seed today ({DATE}) with 1–3 stamps, then open the day and exercise the real
        gestures: <b>long-press</b> to select (blue glow), drag to move, two fingers to pinch and
        twist (it snaps to 45° when you let go), a <b>short tap</b> to send a stamp front/back,
        the <b>✕</b> to delete (then <b>Undo</b>). Nothing should ever be pushable off the page,
        and the + FAB disappears at 3 stamps.
      </p>
      <p className="mt-2 max-w-prose text-sm text-muted">
        <b>The canary:</b> open and close the day ~50× — the live object-URL count must return to
        the same baseline every time (ALG-6, the freeze fix).
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {[1, 2, 3].map((n) => (
          <button
            key={n}
            type="button"
            disabled={busy}
            onClick={() => void reseed(n)}
            className="rounded-control border border-line px-3 py-1.5 text-sm"
          >
            Seed {n} stamp{n > 1 ? "s" : ""}
          </button>
        ))}
        <button
          type="button"
          onClick={openDay}
          className="rounded-control bg-accent px-4 py-1.5 text-sm font-semibold text-paper"
        >
          Open the day
        </button>
      </div>

      <p className="mt-4 font-mono text-sm">
        live object-URLs: <b>{urlCount}</b> · opens: <b>{opens}</b> · live stamps:{" "}
        <b>{view.stamps.length}</b> · selected: <b>{selected ?? "—"}</b>
      </p>

      {open ? (
        <DayPage
          date={DATE}
          fromRect={null}
          dayNumber={Number(DATE.slice(8))}
          selected={selected}
          onSelect={setSelected}
          onAddStamp={() => {
            /* the picker flow is exercised from the real calendar */
          }}
          onClose={() => {
            setSelected(null);
            setOpen(false);
          }}
        />
      ) : null}
    </main>
  );
}
