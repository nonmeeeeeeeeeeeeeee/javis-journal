"use client";

// Dev-only seed harness for the M4 calendar. NOT a shipped route. It injects
// synthetic entries/stamps/image rows/thumb blobs into Dexie so the real <Calendar/>
// renders real 256px thumbnails, and exposes the ALG-6 object-URL canary: a live
// URL-count readout + an auto-cycling probe that mounts/unmounts month data across a
// range. If release-on-unmount works, the count stays flat as the probe cycles.

import { useEffect, useState } from "react";

import { Calendar } from "@/components/calendar/Calendar";
import { db } from "@/lib/db";
import type { Entry, ImageRow, Stamp } from "@/lib/db/types";
import type { ImageBlobRow } from "@/lib/db/image-types";
import { useMonthData } from "@/lib/db/queries";
import { getLiveThumbUrlCount } from "@/lib/image/thumb-url";
import {
  addMonths,
  currentYearMonth,
  daysInMonth,
  EPOCH,
  isoDate,
} from "@/lib/calendar/month-grid";

const SEED_USER = "dev-seed";
const MONTHS_BACK = 3; // seed the current month + this many prior months

async function makeThumbBlob(hue: number, label: string): Promise<Blob> {
  const c = document.createElement("canvas");
  c.width = 96;
  c.height = 96;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = `hsl(${hue} 65% 68%)`;
  ctx.fillRect(0, 0, 96, 96);
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.font = "bold 34px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, 48, 52);
  return new Promise<Blob>((resolve) =>
    c.toBlob((b) => resolve(b!), "image/jpeg", 0.8),
  );
}

async function seed(): Promise<void> {
  const now = new Date().toISOString();
  const cur = currentYearMonth();

  for (let back = 0; back < MONTHS_BACK; back++) {
    const ym = addMonths(cur, -back);
    const dim = daysInMonth(ym.year, ym.month);

    for (let day = 1; day <= dim; day++) {
      if (day % 5 === 0) continue; // leave a few empty days per month
      const date = isoDate(ym.year, ym.month, day);
      const entry: Entry = {
        id: `dev-e-${date}`,
        user_id: SEED_USER,
        entry_date: date,
        created_at: now,
        updated_at: now,
      };
      await db.entries.put(entry);

      // 1–2 stamps; the highest layer_order (last) is the one the grid shows.
      const nStamps = day % 3 === 0 ? 2 : 1;
      for (let s = 0; s < nStamps; s++) {
        const imgId = `dev-img-${date}-${s}`;
        const thumb = await makeThumbBlob((day * 13 + s * 150) % 360, String(day));
        const image: ImageRow = {
          id: imgId,
          user_id: SEED_USER,
          storage_path: `dev/${imgId}.jpg`,
          thumb_path: `dev/${imgId}_t.jpg`,
          width: 96,
          height: 96,
          mime: "image/jpeg",
          byte_size: 1000,
          created_at: now,
        };
        const blob: ImageBlobRow = {
          id: imgId,
          original: null,
          main: null,
          thumb,
          kind: "photo",
          createdAt: Date.now(),
        };
        const stamp: Stamp = {
          id: `dev-s-${date}-${s}`,
          entry_id: entry.id,
          user_id: SEED_USER,
          image_id: imgId,
          mask_type: "circle",
          crop_offset_x: 0,
          crop_offset_y: 0,
          crop_scale: 1,
          pos_x: 0,
          pos_y: 0,
          scale: 1,
          rotation_deg: 0,
          layer_order: s,
          created_at: now,
          updated_at: now,
          deleted_at: null,
        };
        await db.images.put(image);
        await db.image_blobs.put(blob);
        await db.stamps.put(stamp);
      }
    }
  }
}

async function clearSeed(): Promise<void> {
  for (const t of [db.entries, db.stamps, db.images] as const) {
    const keys = await t
      .filter((r) => typeof r.id === "string" && r.id.startsWith("dev-"))
      .primaryKeys();
    await t.bulkDelete(keys as string[]);
  }
  const blobKeys = await db.image_blobs
    .filter((r) => r.id.startsWith("dev-img-"))
    .primaryKeys();
  await db.image_blobs.bulkDelete(blobKeys as string[]);
}

export default function CalendarHarnessPage() {
  const [busy, setBusy] = useState<string | null>(null);
  const [cycling, setCycling] = useState(false);

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <Calendar />

      <div className="fixed bottom-3 left-3 z-[60] w-64 rounded-card border border-line bg-paper/95 p-3 text-xs text-ink shadow-lg backdrop-blur">
        <p className="mb-2 font-title text-sm font-semibold">M4 calendar harness</p>

        <div className="mb-2 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => run("seed", seed)}
            className="rounded-control border border-line bg-accent-soft px-2 py-1 font-bold disabled:opacity-50"
          >
            {busy === "seed" ? "Seeding…" : "Seed 3 months"}
          </button>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => run("clear", clearSeed)}
            className="rounded-control border border-line px-2 py-1 font-bold disabled:opacity-50"
          >
            Clear
          </button>
        </div>

        <LiveCount />

        <label className="mt-2 flex items-center gap-2">
          <input
            type="checkbox"
            checked={cycling}
            onChange={(e) => setCycling(e.target.checked)}
          />
          Auto-cycle months (canary)
        </label>
        {cycling ? <CanaryProbe /> : null}

        <p className="mt-2 text-[0.7rem] leading-snug text-muted">
          Seed, then navigate months (long-press the title or the 3-dots → Change
          month). The live-URL count should stay flat.
        </p>
      </div>
    </>
  );
}

function LiveCount() {
  const [n, setN] = useState(0);
  const [peak, setPeak] = useState(0);
  useEffect(() => {
    const id = setInterval(() => {
      const c = getLiveThumbUrlCount();
      setN(c);
      setPeak((p) => Math.max(p, c));
    }, 200);
    return () => clearInterval(id);
  }, []);
  return (
    <p className="font-mono">
      live object-URLs: <span className="font-bold">{n}</span>{" "}
      <span className="text-muted">(peak {peak})</span>
    </p>
  );
}

// Cycles a mounted month-data consumer across [EPOCH .. EPOCH+12], keyed by month so
// each step forces unmount → remount (exercises the load-bearing release-on-unmount).
function CanaryProbe() {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setIdx((i) => i + 1), 300);
    return () => clearInterval(id);
  }, []);
  const ym = addMonths(EPOCH, idx % 13);
  return <ProbeMount key={`${ym.year}-${ym.month}`} year={ym.year} month={ym.month} />;
}

function ProbeMount({ year, month }: { year: number; month: number }) {
  const data = useMonthData(year, month);
  const withThumb = [...data.values()].filter((d) => d.thumbUrl).length;
  return (
    <p className="font-mono text-[0.7rem] text-muted">
      probe {year}-{String(month).padStart(2, "0")}: {data.size} days / {withThumb}{" "}
      thumbs
    </p>
  );
}
