// The 4 shipped stamp masks (decision 4/5): postage · cloud · spiky · heart.
//
// Each mask is authored as an SVG-path→Path2D alpha, generated for whatever (w, h) the
// preview or bake needs — crisp anti-aliased edges at any resolution, ~KB of code.
// `path(w,h)` is the alpha applied via destination-in; `frame(w,h)` (postage only) is a
// perforated border painted source-over ON TOP of the bake with `frameStyle`.
//
// IMPORTANT: `new Path2D(...)` is only constructed INSIDE path()/frame(), never at module
// load — so this module imports cleanly in the node/vitest environment (which has no
// Path2D). Only the browser preview/bake ever calls these functions.

export type MaskId = "postage" | "cloud" | "spiky" | "heart";

export type StampMask = {
  id: MaskId;
  label: string;
  /** Committed intrinsic aspect ratio (width / height). Deterministic bake + window. */
  aspect: number;
  /** Alpha shape filled with destination-in. Full-bleed within the (w,h) box. */
  path: (w: number, h: number) => Path2D;
  /** Optional overlay painted source-over on top of the bake (postage perforation). */
  frame?: (w: number, h: number) => Path2D;
  /** Fill style for `frame` (only meaningful when frame is present). */
  frameStyle?: string;
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

// ---- spiky (aspect 1:1) — a starburst -------------------------------------------------
function spikyPath(w: number, h: number): Path2D {
  const spikes = 14;
  const cx = 0.5 * w;
  const cy = 0.5 * h;
  const outerX = 0.49 * w;
  const outerY = 0.49 * h;
  const innerX = 0.33 * w;
  const innerY = 0.33 * h;
  let d = "";
  for (let k = 0; k < spikes * 2; k += 1) {
    const angle = -Math.PI / 2 + (k * Math.PI) / spikes;
    const rx = k % 2 === 0 ? outerX : innerX;
    const ry = k % 2 === 0 ? outerY : innerY;
    const x = cx + rx * Math.cos(angle);
    const y = cy + ry * Math.sin(angle);
    d += `${k === 0 ? "M" : "L"}${f(x)} ${f(y)}`;
  }
  return new Path2D(`${d}Z`);
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

// ---- postage (aspect 3:4) — rectangular alpha + perforated frame ----------------------
function postagePath(w: number, h: number): Path2D {
  // Full-bleed rectangle: the photo fills the whole window; the perforation lives on the
  // frame overlay, not the silhouette (decision 4).
  return new Path2D(`M0 0L${f(w)} 0L${f(w)} ${f(h)}L0 ${f(h)}Z`);
}

function postageFrame(w: number, h: number): Path2D {
  const t = Math.min(w, h) * 0.09; // border thickness
  const bump = t * 0.62; // scallop depth into the band
  // Outer contour = the window rect (clockwise). Inner contour = an inset rect whose edges
  // scallop OUTWARD into the band; filled evenodd → a white perforated border ring.
  let d = `M0 0L${f(w)} 0L${f(w)} ${f(h)}L0 ${f(h)}Z`;

  const inset = { l: t, tp: t, r: w - t, b: h - t };
  // edge: A -> B with an outward normal `n`; chain quadratic scallops.
  const edge = (
    ax: number,
    ay: number,
    bx: number,
    by: number,
    nx: number,
    ny: number,
    first: boolean,
  ) => {
    const len = Math.hypot(bx - ax, by - ay);
    const n = Math.max(3, Math.round(len / (2 * bump)));
    const dx = (bx - ax) / n;
    const dy = (by - ay) / n;
    if (first) d += `M${f(ax)} ${f(ay)}`;
    for (let i = 0; i < n; i += 1) {
      const p0x = ax + dx * i;
      const p0y = ay + dy * i;
      const p1x = ax + dx * (i + 1);
      const p1y = ay + dy * (i + 1);
      const mx = (p0x + p1x) / 2 + nx * bump;
      const my = (p0y + p1y) / 2 + ny * bump;
      d += `Q${f(mx)} ${f(my)} ${f(p1x)} ${f(p1y)}`;
    }
  };
  edge(inset.l, inset.tp, inset.r, inset.tp, 0, -1, true); // top, bulge up
  edge(inset.r, inset.tp, inset.r, inset.b, 1, 0, false); // right, bulge right
  edge(inset.r, inset.b, inset.l, inset.b, 0, 1, false); // bottom, bulge down
  edge(inset.l, inset.b, inset.l, inset.tp, -1, 0, false); // left, bulge left
  d += "Z";
  return new Path2D(d);
}

export const MASKS: readonly StampMask[] = [
  { id: "postage", label: "Postage", aspect: 3 / 4, path: postagePath, frame: postageFrame, frameStyle: "#ffffff" },
  { id: "cloud", label: "Cloud", aspect: 1.4, path: cloudPath },
  { id: "spiky", label: "Spiky", aspect: 1, path: spikyPath },
  { id: "heart", label: "Heart", aspect: 1, path: heartPath },
] as const;

export const MASK_IDS: readonly MaskId[] = MASKS.map((m) => m.id);

export function maskById(id: MaskId): StampMask {
  const mask = MASKS.find((m) => m.id === id);
  if (!mask) throw new Error(`Unknown mask id: ${id}`);
  return mask;
}
