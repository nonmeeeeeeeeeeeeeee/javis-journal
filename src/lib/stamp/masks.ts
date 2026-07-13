// The 4 shipped stamp masks (decision 4/5): postage · cloud · star · heart.
//
// Each mask is authored as an SVG-path→Path2D alpha, generated for whatever (w, h) the
// preview or bake needs — crisp anti-aliased edges at any resolution, ~KB of code. `path(w,h)`
// is the alpha applied via destination-in, and it is the WHOLE stamp: nothing is ever painted
// on top. (M6 removed postage's white perforated band — the perforation now lives in the alpha,
// so a stamp is only ever photo pixels and transparency.)
//
// IMPORTANT: `new Path2D(...)` is only constructed INSIDE path(), never at module load — so this
// module imports cleanly in the node/vitest environment (which has no Path2D). Only the browser
// preview/bake ever calls these functions.

export type MaskId = "postage" | "cloud" | "spiky" | "heart";

export type StampMask = {
  /** Stable id — also the persisted `stamps.mask_type`. ("spiky" is the star, historically.) */
  id: MaskId;
  label: string;
  /** Committed intrinsic aspect ratio (width / height). Deterministic bake + window. */
  aspect: number;
  /** Alpha shape filled with destination-in. Full-bleed within the (w,h) box. */
  path: (w: number, h: number) => Path2D;
};

const f = (n: number): string => n.toFixed(4);

// ---- heart (aspect 1:1) ----------------------------------------------------------------
function heartPath(w: number, h: number): Path2D {
  // Two-lobe cubic heart kept within ~[0.02,0.98] of the box so nothing clips.
  const d =
    `M${f(0.5 * w)} ${f(0.35 * h)}` +
    `C${f(0.5 * w)} ${f(0.18 * h)} ${f(0.3 * w)} ${f(0.08 * h)} ${f(0.16 * w)} ${f(0.16 * h)}` +
    `C${f(0.02 * w)} ${f(0.24 * h)} ${f(0.02 * w)} ${f(0.44 * h)} ${f(0.14 * w)} ${f(0.58 * h)}` +
    `C${f(0.24 * w)} ${f(0.7 * h)} ${f(0.4 * w)} ${f(0.8 * h)} ${f(0.5 * w)} ${f(0.92 * h)}` +
    `C${f(0.6 * w)} ${f(0.8 * h)} ${f(0.76 * w)} ${f(0.7 * h)} ${f(0.86 * w)} ${f(0.58 * h)}` +
    `C${f(0.98 * w)} ${f(0.44 * h)} ${f(0.98 * w)} ${f(0.24 * h)} ${f(0.84 * w)} ${f(0.16 * h)}` +
    `C${f(0.7 * w)} ${f(0.08 * h)} ${f(0.5 * w)} ${f(0.18 * h)} ${f(0.5 * w)} ${f(0.35 * h)}Z`;
  return new Path2D(d);
}

// ---- star (aspect 1:1) — 5 points, tips AND valleys rounded --------------------------
/**
 * Round every corner of a closed polygon: at each vertex, cut the corner back along both edges
 * by `r` and join the two cut points with a quadratic through the vertex. `r` is capped at half
 * the shorter adjacent edge, so a thin star spike rounds off rather than folding inside out.
 */
function roundedPolygon(pts: { x: number; y: number }[], radii: number[]): Path2D {
  const n = pts.length;
  const cut = (from: { x: number; y: number }, to: { x: number; y: number }, r: number) => {
    const len = Math.hypot(to.x - from.x, to.y - from.y) || 1;
    const t = Math.min(r, len / 2) / len;
    return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
  };

  let d = "";
  for (let i = 0; i < n; i += 1) {
    const prev = pts[(i - 1 + n) % n];
    const cur = pts[i];
    const next = pts[(i + 1) % n];
    const a = cut(cur, prev, radii[i]); // step back toward the previous vertex
    const b = cut(cur, next, radii[i]); // step forward toward the next one
    d += i === 0 ? `M${f(a.x)} ${f(a.y)}` : `L${f(a.x)} ${f(a.y)}`;
    d += `Q${f(cur.x)} ${f(cur.y)} ${f(b.x)} ${f(b.y)}`;
  }
  return new Path2D(`${d}Z`);
}

function starPath(w: number, h: number): Path2D {
  const points = 5;
  const cx = 0.5 * w;
  const cy = 0.52 * h; // a 5-point star's visual center sits below its geometric one
  const outer = 0.49 * Math.min(w, h);
  const inner = 0.42 * outer; // the classic sheriff/sticker proportion
  const size = Math.min(w, h);

  const pts: { x: number; y: number }[] = [];
  const radii: number[] = [];
  for (let k = 0; k < points * 2; k += 1) {
    const angle = -Math.PI / 2 + (k * Math.PI) / points;
    const r = k % 2 === 0 ? outer : inner;
    pts.push({ x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) });
    // Tips round generously; valleys round a touch less, so the star stays crisp.
    radii.push(k % 2 === 0 ? 0.085 * size : 0.055 * size);
  }
  return roundedPolygon(pts, radii);
}

// ---- cloud (aspect 1.4:1) — a scalloped blob ------------------------------------------
function cloudPath(w: number, h: number): Path2D {
  const bumps = 11;
  const cx = 0.5 * w;
  const cy = 0.5 * h;
  const rx = 0.46 * w;
  const ry = 0.42 * h;
  const pt = (i: number) => {
    const a = (i * 2 * Math.PI) / bumps - Math.PI / 2;
    return { x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) };
  };
  let d = "";
  for (let i = 0; i < bumps; i += 1) {
    const a = pt(i);
    const b = pt(i + 1);
    if (i === 0) d += `M${f(a.x)} ${f(a.y)}`;
    // Outward semicircular scallop between adjacent rim points → cloud/flower edge.
    const chord = Math.hypot(b.x - a.x, b.y - a.y);
    const r = chord * 0.62;
    d += `A${f(r)} ${f(r)} 0 0 1 ${f(b.x)} ${f(b.y)}`;
  }
  return new Path2D(`${d}Z`);
}

// ---- postage (aspect 3:4) — the perforated edge, cut into the ALPHA -------------------
/**
 * A stamp silhouette: a rectangle whose edges are a chain of OUTWARD semicircular scallops —
 * the classic torn-from-the-sheet perforation. (Until M6 this was a plain full-bleed rectangle
 * with a white perforated band painted on top; the band bled white onto the journal page, so
 * the perforation moved into the alpha and the overlay pass is gone.)
 */
/** Scallops per edge, corners excluded — a FIXED count, so the perforation reads the same at
 *  any bake size (a radius-derived count drifts with the box). Postage is 3:4, so 6 across the
 *  short edges and 8 down the long ones makes the bumps very nearly square. */
const POSTAGE_BUMPS = { short: 6, long: 8 };

function postagePath(w: number, h: number): Path2D {
  // Inset by one bump radius so the OUTWARD crests land exactly on the box's edges (full-bleed,
  // nothing wasted) rather than outside it, where the canvas would clip every one of them away
  // and the stamp would degenerate into a bare rectangle.
  //
  // The inset is one radius, and the radius is half a chord, and the chords tile the run — so
  // r = w / (2·n + 2) makes the top's 6 bumps come out exactly circular.
  const r = w / (2 * POSTAGE_BUMPS.short + 2);
  const l = r;
  const t = r;
  const right = w - r;
  const b = h - r;

  // The outline is traversed clockwise (y down), so sweep-flag 1 arcs AWAY from the interior.
  const edge = (ax: number, ay: number, bx: number, by: number, n: number) => {
    const dx = (bx - ax) / n;
    const dy = (by - ay) / n;
    const rad = Math.hypot(dx, dy) / 2; // each bump is a semicircle on its chord
    let seg = "";
    for (let i = 0; i < n; i += 1) {
      seg += `A${f(rad)} ${f(rad)} 0 0 1 ${f(ax + dx * (i + 1))} ${f(ay + dy * (i + 1))}`;
    }
    return seg;
  };

  const short = POSTAGE_BUMPS.short;
  const long = POSTAGE_BUMPS.long;
  return new Path2D(
    `M${f(l)} ${f(t)}` +
      edge(l, t, right, t, short) + // top
      edge(right, t, right, b, long) + // right
      edge(right, b, l, b, short) + // bottom
      edge(l, b, l, t, long) + // left
      "Z",
  );
}

export const MASKS: readonly StampMask[] = [
  { id: "postage", label: "Postage", aspect: 3 / 4, path: postagePath },
  { id: "cloud", label: "Cloud", aspect: 1.4, path: cloudPath },
  // The id stays "spiky" (it is the persisted mask_type + a DB check-constraint value); M6
  // reshaped it from a 14-spike starburst into a rounded 5-point star.
  { id: "spiky", label: "Star", aspect: 1, path: starPath },
  { id: "heart", label: "Heart", aspect: 1, path: heartPath },
] as const;

export const MASK_IDS: readonly MaskId[] = MASKS.map((m) => m.id);

export function maskById(id: MaskId): StampMask {
  const mask = MASKS.find((m) => m.id === id);
  if (!mask) throw new Error(`Unknown mask id: ${id}`);
  return mask;
}
