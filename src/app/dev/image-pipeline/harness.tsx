"use client";

import { useCallback, useEffect, useState } from "react";

import { db } from "@/lib/db";
import { evictOriginals } from "@/lib/image/eviction";
import { isHeic, readMagicBytes } from "@/lib/image/heic";
import { ingestImage } from "@/lib/image/ingest";
import { ImagePipelineError } from "@/lib/image/process";
import { getThumbUrl, type ThumbHandle } from "@/lib/image/thumb-url";
import { flushNow } from "@/lib/sync/engine";
import { getSyncStatus } from "@/lib/sync/status";

type UploadState = "pending" | "quarantined" | "durable";

type Item = {
  id: string;
  detected: string;
  mime: string;
  width: number | null;
  height: number | null;
  mainBytes: number;
  originalRetained: boolean;
  thumbSource: "local" | "signed" | "none";
  upload: UploadState;
  lastError: string | null;
  thumbUrl: string | null;
};

async function inspect(id: string): Promise<Item | null> {
  const [blob, row, outbox] = await Promise.all([
    db.image_blobs.get(id),
    db.images.get(id),
    db.sync_outbox.where("[table+rowId]").equals(["images", id]).first(),
  ]);
  if (!row) return null;

  const upload: UploadState = !outbox
    ? "durable"
    : outbox.quarantined
      ? "quarantined"
      : "pending";

  return {
    id,
    detected: blob?.kind ?? "photo",
    mime: row.mime,
    width: row.width,
    height: row.height,
    mainBytes: blob?.main?.size ?? 0,
    originalRetained: Boolean(blob?.original),
    thumbSource: blob?.thumb ? "local" : row.thumb_path ? "signed" : "none",
    upload,
    lastError: outbox?.lastError ?? null,
    thumbUrl: null,
  };
}

export function ImagePipelineHarness() {
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<string>("idle");

  const refresh = useCallback(async () => {
    const ids = await db.image_blobs.orderBy("createdAt").reverse().primaryKeys();
    const inspected = (await Promise.all(ids.map((id) => inspect(String(id))))).filter(
      (i): i is Item => i !== null,
    );

    const handles: ThumbHandle[] = [];
    for (const item of inspected) {
      const handle = await getThumbUrl(item.id);
      if (handle) {
        item.thumbUrl = handle.url;
        handles.push(handle);
      }
    }
    setItems(inspected);
    setSyncStatus(getSyncStatus());
    // Release the object URLs on the next refresh (best-effort demo hygiene).
    return () => handles.forEach((h) => h.release());
  }, []);

  useEffect(() => {
    // Deferred (not synchronous in the effect body) initial load, then poll.
    const initial = setTimeout(() => void refresh(), 0);
    const interval = setInterval(() => void refresh(), 2000);
    return () => {
      clearTimeout(initial);
      clearInterval(interval);
    };
  }, [refresh]);

  const onPick = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) return;

      setBusy(true);
      setError(null);
      try {
        const heic = isHeic(await readMagicBytes(file));
        const kind = file.type === "image/png" ? "sticker" : "photo";
        const id = await ingestImage(file, kind);
        // Surface the detected input type immediately.
        console.log(`[harness] ingested ${id} (input HEIC=${heic}, kind=${kind})`);
        await refresh();
      } catch (err) {
        setError(
          err instanceof ImagePipelineError
            ? `Pipeline error (fail-closed): ${err.message}`
            : `Unexpected error: ${String(err)}`,
        );
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  const onEvict = useCallback(async () => {
    const n = await evictOriginals();
    console.log(`[harness] evictOriginals dropped ${n} original(s)`);
    await refresh();
  }, [refresh]);

  const onClearBlobs = useCallback(
    async (id: string) => {
      // Second-device simulation: drop local blobs so display re-resolves via a signed URL.
      await db.image_blobs.delete(id);
      await refresh();
    },
    [refresh],
  );

  return (
    <main style={{ padding: 24, fontFamily: "system-ui, sans-serif", maxWidth: 720 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700 }}>M3 image-pipeline harness</h1>
      <p style={{ color: "#666", fontSize: 14 }}>
        Dev-only. Pick a photo (iPhone HEIC or a large JPEG) to run pick → process →
        upload → display. Watch upload status and thumb source update live.
      </p>

      <div style={{ margin: "16px 0", display: "flex", gap: 12, alignItems: "center" }}>
        <input type="file" accept="image/*" onChange={onPick} disabled={busy} />
        <button onClick={() => void flushNow()} disabled={busy}>
          Sync now
        </button>
        <button onClick={() => void onEvict()} disabled={busy}>
          Force evictOriginals()
        </button>
        <span style={{ fontSize: 13, color: "#666" }}>
          sync: <b>{syncStatus}</b>
        </span>
      </div>

      {busy && <p>Processing…</p>}
      {error && <p style={{ color: "crimson" }}>{error}</p>}

      <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 12 }}>
        {items.map((item) => (
          <li
            key={item.id}
            style={{ border: "1px solid #ddd", borderRadius: 8, padding: 12, display: "flex", gap: 12 }}
          >
            {item.thumbUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.thumbUrl}
                alt="thumb"
                width={64}
                height={64}
                style={{ objectFit: "cover", borderRadius: 4, background: "#f3f3f3" }}
              />
            ) : (
              <div style={{ width: 64, height: 64, background: "#f3f3f3", borderRadius: 4 }} />
            )}
            <div style={{ fontSize: 13, lineHeight: 1.5 }}>
              <div style={{ fontFamily: "monospace" }}>{item.id.slice(0, 8)}…</div>
              <div>
                {item.mime} · {item.width}×{item.height} · main {(item.mainBytes / 1024).toFixed(0)}KB
              </div>
              <div>
                upload: <b>{item.upload}</b> · thumb: <b>{item.thumbSource}</b> · original:{" "}
                <b>{item.originalRetained ? "retained" : "evicted"}</b>
              </div>
              {item.lastError && (
                <div style={{ color: "crimson", fontFamily: "monospace", fontSize: 12 }}>
                  {item.lastError}
                </div>
              )}
              <button onClick={() => void onClearBlobs(item.id)} style={{ marginTop: 4 }}>
                Clear local blobs (2nd-device sim)
              </button>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
