// Deterministic, idempotent Storage object paths (decision 8). Pure — Tier-1 tested.
// RLS on the private `images` bucket requires foldername[1] === auth.uid(), so every
// path is `{uid}/…`. Deterministic paths mean a retry overwrites the same object.

import type { ProcessKind } from "./process";

export function mainPath(uid: string, id: string, kind: ProcessKind): string {
  const ext = kind === "sticker" ? "png" : "jpg";
  return `${uid}/${id}.${ext}`;
}

export function thumbPath(uid: string, id: string): string {
  return `${uid}/${id}_thumb.jpg`;
}
