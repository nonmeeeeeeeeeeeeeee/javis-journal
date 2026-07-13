// Deterministic, idempotent Storage object paths (decision 8). Pure — Tier-1 tested.
// RLS on the private `images` bucket requires foldername[1] === auth.uid(), so every
// path is `{uid}/…`. Deterministic paths mean a retry overwrites the same object.

import type { ProcessKind } from "./process";

export function mainPath(uid: string, id: string, kind: ProcessKind): string {
  const ext = kind === "sticker" ? "png" : "jpg";
  return `${uid}/${id}.${ext}`;
}

/** A sticker's thumb is PNG (it must keep its alpha — a JPEG thumb renders black); photos JPEG. */
export function thumbPath(uid: string, id: string, kind: ProcessKind = "photo"): string {
  const ext = kind === "sticker" ? "png" : "jpg";
  return `${uid}/${id}_thumb.${ext}`;
}

// M5 baked stamps (ADR-M5) upload as WebP-alpha (or PNG-alpha fallback), so both the
// closeup and the thumb carry the bake mime's extension — unlike photo/sticker whose thumb
// is always JPEG. Deterministic per (uid, id, mime) so a retry overwrites the same object;
// still `{uid}/…` so the bucket RLS (foldername[1] === uid) is satisfied.
const STAMP_EXT_BY_MIME: Record<string, string> = {
  "image/webp": "webp",
  "image/png": "png",
};

export function extForStampMime(mime: string): string {
  return STAMP_EXT_BY_MIME[mime] ?? "webp";
}

export function stampMainPath(uid: string, id: string, mime: string): string {
  return `${uid}/${id}.${extForStampMime(mime)}`;
}

export function stampThumbPath(uid: string, id: string, mime: string): string {
  return `${uid}/${id}_thumb.${extForStampMime(mime)}`;
}
