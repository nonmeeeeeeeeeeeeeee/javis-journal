"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Stamper } from "@/components/Stamper";
import { db } from "@/lib/db";
import { isHeic, readMagicBytes } from "@/lib/image/heic";
import { getCloseupUrl, getThumbUrl, type ThumbHandle } from "@/lib/image/thumb-url";
import { flushNow } from "@/lib/sync/engine";
import { getSyncStatus } from "@/lib/sync/status";

type UploadState = "pending" | "quarantined" | "durable";

type Meta = { inputType: string; heic: boolean };

type Item = {
  id: string;
  mime: string;
  width: number | null;
  height: number | null;
  closeupBytes: number;
  thumbBytes: number;
  closeupSource: "local" | "signed" | "none";
  thumbSource: "local" | "signed" | "none";
  upload: UploadState;
  lastError: string | null;
  inputType: string;
  heic: boolean;
  closeupUrl: string | null;
  thumbUrl: string | null;
};

export function StamperHarness() {
  const [file, setFile] = useState<File | null>(null);
  const [ids, setIds] = useState<string[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [syncStatus, setSyncStatus] = useState("idle");
  const [error, setError] = useState<string | null>(null);

  const metaRef = useRef<Map<string, Meta>>(new Map());
  const pendingMetaRef = useRef<Meta | null>(null);
  const handlesRef = useRef<ThumbHandle[]>([]);

  const refresh = useCallback(async () => {
    handlesRef.current.forEach((h) => h.release());
    handlesRef.current = [];

    const inspected: Item[] = [];
    for (const id of ids) {
      const [blob, row, outbox] = await Promise.all([
        db.image_blobs.get(id),
        db.images.get(id),
        db.sync_outbox.where("[table+rowId]").equals(["images", id]).first(),
      ]);
      if (!row) continue;

      const upload: UploadState = !outbox
        ? "durable"
        : outbox.quarantined
          ? "quarantined"
          : "pending";

      const closeup = await getCloseupUrl(id);
      const thumb = await getThumbUrl(id);
      if (closeup) handlesRef.current.push(closeup);
      if (thumb) handlesRef.current.push(thumb);

      const meta = metaRef.current.get(id);
      inspected.push({
        id,
        mime: row.mime,
        width: row.width,
        height: row.height,
        closeupBytes: blob?.main?.size ?? 0,
        thumbBytes: blob?.thumb?.size ?? 0,
        closeupSource: blob?.main ? "local" : row.storage_path ? "signed" : "none",
        thumbSource: blob?.thumb ? "local" : row.thumb_path ? "signed" : "none",
        upload,
        lastError: outbox?.lastError ?? null,
        inputType: meta?.inputType ?? "?",
        heic: meta?.heic ?? false,
        closeupUrl: closeup?.url ?? null,
        thumbUrl: thumb?.url ?? null,
      });
    }
    setItems(inspected);
    setSyncStatus(getSyncStatus());
  }, [ids]);

  useEffect(() => {
    const initial = setTimeout(() => void refresh(), 0);
    const interval = setInterval(() => void refresh(), 2000);
    return () => {
      clearTimeout(initial);
      clearInterval(interval);
    };
  }, [refresh]);

  const onPick = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const picked = event.target.files?.[0];
    event.target.value = "";
    if (!picked) return;
    setError(null);
    try {
      const heic = isHeic(await readMagicBytes(picked));
      pendingMetaRef.current = { inputType: picked.type || "(none)", heic };
    } catch {
      pendingMetaRef.current = { inputType: picked.type || "(none)", heic: false };
    }
    setFile(picked);
  }, []);

  const onConfirm = useCallback((id: string) => {
    if (pendingMetaRef.current) metaRef.current.set(id, pendingMetaRef.current);
    pendingMetaRef.current = null;
    setFile(null);
    setIds((prev) => (prev.includes(id) ? prev : [id, ...prev]));
  }, []);

  const onCancel = useCallback(() => {
    pendingMetaRef.current = null;
    setFile(null);
  }, []);

  const onClearBlobs = useCallback(
    async (id: string) => {
      // Second-device simulation: drop local blobs so display re-resolves via signed URLs.
      await db.image_blobs.delete(id);
      await refresh();
    },
    [refresh],
  );

  return (
    <main className="mx-auto min-h-screen max-w-2xl bg-page p-6 text-ink">
      <h1 className="font-title text-2xl">M5 stamper harness</h1>
      <p className="mt-1 text-sm text-muted">
        Dev-only. Pick a photo (iPhone HEIC or a large JPEG), frame it in the punch machine&apos;s
        window — drag to pan, two fingers to pinch-zoom and twist — cycle the mask with ‹ ›, then
        press the drawer to cut. Confirm the bake matches the preview, no blank corner at any
        rotation, and the upload goes durable. Use “Clear local blobs” to simulate a second
        device re-resolving via signed URLs.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <input type="file" accept="image/*" onChange={onPick} disabled={file !== null} />
        <button
          type="button"
          onClick={() => void flushNow()}
          className="rounded-control border border-line px-3 py-1.5 text-sm"
        >
          Sync now
        </button>
        <button
          type="button"
          onClick={() => void refresh()}
          className="rounded-control border border-line px-3 py-1.5 text-sm"
        >
          Re-resolve
        </button>
        <span className="text-sm text-muted">
          sync: <b>{syncStatus}</b>
        </span>
      </div>

      {error && <p className="mt-3 text-sm text-accent">{error}</p>}

      {file && (
        <div className="mt-6">
          <Stamper key={fileKey(file)} file={file} onConfirm={onConfirm} onCancel={onCancel} />
        </div>
      )}

      <ul className="mt-8 grid list-none gap-4 p-0">
        {items.map((item) => (
          <li key={item.id} className="flex gap-4 rounded-card border border-line p-3">
            <div className="flex flex-col items-center gap-2">
              {item.closeupUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.closeupUrl}
                  alt="closeup"
                  className="h-28 w-28 rounded-cell object-contain"
                  style={{ background: "var(--color-accent-soft)" }}
                />
              ) : (
                <div className="h-28 w-28 rounded-cell bg-line-soft" />
              )}
              {item.thumbUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.thumbUrl}
                  alt="thumb"
                  className="h-12 w-12 rounded object-contain"
                  style={{ background: "var(--color-accent-soft)" }}
                />
              ) : (
                <div className="h-12 w-12 rounded bg-line-soft" />
              )}
            </div>
            <div className="text-sm leading-relaxed">
              <div className="font-mono text-xs text-muted">{item.id.slice(0, 8)}…</div>
              <div>
                input: <b>{item.inputType}</b>
                {item.heic && <b> · HEIC→transcoded</b>}
              </div>
              <div>
                baked: <b>{item.mime}</b> · {item.width}×{item.height} · closeup{" "}
                {(item.closeupBytes / 1024).toFixed(0)}KB · thumb {(item.thumbBytes / 1024).toFixed(0)}KB
              </div>
              <div>
                upload: <b>{item.upload}</b> · closeup: <b>{item.closeupSource}</b> · thumb:{" "}
                <b>{item.thumbSource}</b>
              </div>
              {item.lastError && (
                <div className="font-mono text-xs text-accent">{item.lastError}</div>
              )}
              <button
                type="button"
                onClick={() => void onClearBlobs(item.id)}
                className="mt-2 rounded-control border border-line px-2 py-1 text-xs"
              >
                Clear local blobs (2nd-device sim)
              </button>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}

// A stable-per-file key so Stamper remounts fresh for each new pick (fresh decode + state).
function fileKey(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
}
