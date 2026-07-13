// Layer order — the whole front/back UI, shared by stamps and stickers (M7). A short tap on an
// element brings it to the front, or sends it to the back if it is already on top; that toggle
// is all there is. `layer_order` is an explicit numeric field (never DOM order) so front/back
// resolves deterministically across devices.
//
// Pure: no React, no Dexie, no DOM.

/** Anything with a tombstone and a layer: a `Stamp`, a `PlacedSticker`. */
export type Layered = {
  id: string;
  layer_order: number;
  deleted_at: string | null;
};

/** Live (non-deleted) elements only — the cap, the cascade, and the layers all count these. */
export function live<T extends Layered>(elements: T[]): T[] {
  return elements.filter((e) => e.deleted_at == null);
}

export function maxLayer(elements: Layered[]): number {
  const rows = live(elements);
  return rows.length === 0 ? 0 : Math.max(...rows.map((e) => e.layer_order));
}

export function minLayer(elements: Layered[]): number {
  const rows = live(elements);
  return rows.length === 0 ? 0 : Math.min(...rows.map((e) => e.layer_order));
}

/** Tap on a buried element → it comes to the front. */
export function bringToFront(elements: Layered[], id: string): number {
  return maxLayer(elements.filter((e) => e.id !== id)) + 1;
}

/** Tap on the top element → it goes to the back. */
export function sendToBack(elements: Layered[], id: string): number {
  return minLayer(elements.filter((e) => e.id !== id)) - 1;
}

/** True iff `id` is the front-most live element (so a tap should send it to the back). */
export function isTopElement(elements: Layered[], id: string): boolean {
  const rows = live(elements);
  const target = rows.find((e) => e.id === id);
  if (!target) return false;
  return rows.every(
    (e) =>
      e.id === id ||
      e.layer_order < target.layer_order ||
      (e.layer_order === target.layer_order && e.id < target.id),
  );
}

/**
 * The layer a tap should move `id` to: to the front if it is buried, to the back if it is
 * already on top. That toggle is the entire layer-order UI (ALG-9).
 */
export function toggleFrontBack(elements: Layered[], id: string): number {
  return isTopElement(elements, id) ? sendToBack(elements, id) : bringToFront(elements, id);
}
