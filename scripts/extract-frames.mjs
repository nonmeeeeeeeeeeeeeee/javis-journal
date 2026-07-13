/**
 * M8 — extract the three Pokémon calendar frames into 9-slice `border-image` sheets.
 *
 *   node scripts/extract-frames.mjs
 *
 * Reads the reference screenshots (see SOURCE_DIR), keys the game background + the text-box's
 * interior fill to alpha 0, and emits a tiny `(L + P + R) x (T + P + B)` tile sheet per frame
 * into public/frames/ — corners verbatim, edge tiles = the one period adjacent to each corner,
 * centre cell empty (we never use `border-image-slice: fill`; the interior stays paper).
 *
 * This script is the record of HOW the frame geometry was measured. Re-run it to re-derive the
 * assets, then copy the printed `ink` / `slice` / sheet numbers into FRAMES in
 * src/lib/frames/spec.ts — the tests there assert they stay self-consistent.
 *
 * Three things here are load-bearing and were each a bug first (see M8-PLAN decisions 4 + 8):
 *
 *  1. INK DEPTH is the *contiguous run inward from an edge*, not "any ink anywhere". The game's
 *     own text inside the box is ink too, so a naive scan reports the whole half-width as border.
 *     Scanlines are also restricted to each axis's middle band, or a line crossing a corner (or
 *     running along the solid top rule) reports the entire edge as ring.
 *  2. THE MIRROR is applied through ONE shared coordinate map, honoured by both the "is this
 *     ink?" test and the pixel copy. Mapping only the test — deciding whether to write using the
 *     flipped pixel, then copying the unflipped one — silently produces a solid colour block.
 *  3. THE SLICE INSET is not the ink thickness: it is grown until the edge strip beyond it is
 *     exactly period-P. That is the phase at which an edge tile tiles seamlessly against its
 *     corner under `border-image-repeat: round`. The surplus (slice - ink) is what
 *     `border-image-outset` bleeds outward, so the ring costs layout only its ink.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { deflateSync, inflateSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_DIR = "C:/Users/olgui/Downloads/calendar frame inspo";
const OUT_DIR = join(ROOT, "public", "frames");

/** Measured period of every frame's border wave, both axes, in source pixels. */
const PERIOD = 8;

const FRAMES = {
  // The RSE option-screen box: one box is 32px tall and the screen stacks five of them.
  // Already symmetric (ink 6/6/6/6), so mirroring it is a no-op that would only break the
  // horizontal phase — hence `mirror: false`.
  rse: {
    file: "Frame_11_RSE.png",
    box: { x: 8, y: 0, w: 224, h: 32 },
    mirror: false,
    clear: ["136,144,248", "248,248,248", "248,176,80", "192,120,0", "192,192,192", "56,56,56", "160,160,152"],
  },
  // Cyan cloud scallop. Source is lopsided (ink: left 10px, right 18px) — mirrored.
  hgss_15: {
    file: "Frame_15_HGSS.png",
    box: { x: 1, y: 146, w: 254, h: 44 },
    mirror: true,
    clear: ["224,232,232", "248,248,248", "80,80,88", "160,160,168"],
  },
  // Blue rule + green leaf strip. Source is badly lopsided (ink: left 11px, right 22px) —
  // mirrored, or the calendar gets a solid green slab down one side only.
  hgss_18: {
    file: "Frame_18_HGSS.png",
    box: { x: 1, y: 145, w: 254, h: 46 },
    mirror: true,
    clear: ["224,232,232", "248,248,248", "224,248,248", "80,80,88", "160,160,168"],
  },
};

// ---------------------------------------------------------------------------- PNG (8-bit, no interlace)

function decodePNG(path) {
  const b = readFileSync(path);
  let off = 8;
  let ihdr = null;
  let plte = null;
  let trns = null;
  const idat = [];
  while (off < b.length) {
    const len = b.readUInt32BE(off);
    const type = b.toString("ascii", off + 4, off + 8);
    const data = b.subarray(off + 8, off + 8 + len);
    if (type === "IHDR") {
      ihdr = { w: data.readUInt32BE(0), h: data.readUInt32BE(4), depth: data[8], color: data[9], interlace: data[12] };
    } else if (type === "IDAT") idat.push(data);
    else if (type === "PLTE") plte = data;
    else if (type === "tRNS") trns = data;
    else if (type === "IEND") break;
    off += 12 + len;
  }
  if (ihdr.depth !== 8 || ihdr.interlace) throw new Error(`${path}: unsupported PNG (depth/interlace)`);

  const raw = inflateSync(Buffer.concat(idat));
  const ch = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ihdr.color];
  const { w, h } = ihdr;
  const stride = w * ch;
  const out = Buffer.alloc(stride * h);
  let prev = Buffer.alloc(stride);
  let p = 0;
  for (let y = 0; y < h; y++) {
    const filter = raw[p++];
    const line = Buffer.from(raw.subarray(p, p + stride));
    p += stride;
    for (let i = 0; i < stride; i++) {
      const a = i >= ch ? line[i - ch] : 0;
      const bb = prev[i];
      const c = i >= ch ? prev[i - ch] : 0;
      let v = line[i];
      if (filter === 1) v += a;
      else if (filter === 2) v += bb;
      else if (filter === 3) v += (a + bb) >> 1;
      else if (filter === 4) {
        const pp = a + bb - c;
        const pa = Math.abs(pp - a);
        const pb = Math.abs(pp - bb);
        const pc = Math.abs(pp - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? bb : c;
      }
      line[i] = v & 0xff;
    }
    line.copy(out, y * stride);
    prev = line;
  }

  const px = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    let r, g, bl;
    let al = 255;
    if (ihdr.color === 2) [r, g, bl] = [out[i * 3], out[i * 3 + 1], out[i * 3 + 2]];
    else if (ihdr.color === 6) [r, g, bl, al] = [out[i * 4], out[i * 4 + 1], out[i * 4 + 2], out[i * 4 + 3]];
    else if (ihdr.color === 3) {
      const k = out[i];
      [r, g, bl] = [plte[k * 3], plte[k * 3 + 1], plte[k * 3 + 2]];
      if (trns && k < trns.length) al = trns[k];
    } else if (ihdr.color === 0) r = g = bl = out[i];
    else [r, g, bl, al] = [out[i * 2], out[i * 2], out[i * 2], out[i * 2 + 1]];
    px.set([r, g, bl, al], i * 4);
  }
  return { w, h, px };
}

let CRC_TABLE = null;
function crc32(buf) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c;
    }
  }
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function encodePNG(w, h, px) {
  const stride = w * 4;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0; // filter: none — these sheets are tiny
    Buffer.from(px.buffer, px.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------- geometry

/** Ink depth from each edge of the box: the contiguous run, skipping the wave's transparent lead-in. */
function inkInsets(at, box) {
  const { x, y, w, h } = box;
  const depth = (sample, len) => {
    let d = 0;
    while (d < len && !sample(d)) d++; // the outer wave dips away from the edge
    if (d === len) return 0;
    while (d < len && sample(d)) d++; // the ink itself
    return d;
  };
  const half = (n) => Math.floor(n / 2);
  let L = 0, R = 0, T = 0, B = 0;
  for (let yy = y + Math.floor(h / 4); yy < y + h - Math.floor(h / 4); yy++) {
    L = Math.max(L, depth((d) => at(x + d, yy), half(w)));
    R = Math.max(R, depth((d) => at(x + w - 1 - d, yy), half(w)));
  }
  for (let xx = x + Math.floor(w / 4); xx < x + w - Math.floor(w / 4); xx++) {
    T = Math.max(T, depth((d) => at(xx, y + d), half(h)));
    B = Math.max(B, depth((d) => at(xx, y + h - 1 - d), half(h)));
  }
  return { T, R, B, L };
}

/** Grow each inset until the edge strip beyond it is exactly period-P — the seamless-tile phase. */
function solveSlice(at, box, ink) {
  const { x, y, w, h } = box;
  const P = PERIOD;
  const colPeriodic = (depth, edge, T, B) => {
    for (let d = 0; d < depth; d++)
      for (let yy = y + T; yy + P <= y + h - B; yy++) {
        const cx = edge === "L" ? x + d : x + w - 1 - d;
        if (at(cx, yy) !== at(cx, yy + P)) return false;
      }
    return true;
  };
  const rowPeriodic = (depth, edge, L, R) => {
    for (let d = 0; d < depth; d++)
      for (let xx = x + L; xx + P <= x + w - R; xx++) {
        const cy = edge === "T" ? y + d : y + h - 1 - d;
        if (at(xx, cy) !== at(xx + P, cy)) return false;
      }
    return true;
  };

  let { T, R, B, L } = ink;
  for (let pass = 0; pass < 64; pass++) {
    let stable = true;
    while (!rowPeriodic(T, "T", L, R) || !rowPeriodic(B, "B", L, R)) { L++; R++; stable = false; }
    while (!colPeriodic(L, "L", T, B) || !colPeriodic(R, "R", T, B)) { T++; B++; stable = false; }
    if (stable) return { T, R, B, L };
  }
  throw new Error("slice solve did not converge");
}

// ---------------------------------------------------------------------------- build

mkdirSync(OUT_DIR, { recursive: true });
const summary = [];

for (const [name, cfg] of Object.entries(FRAMES)) {
  const img = decodePNG(join(SOURCE_DIR, cfg.file));
  const { box } = cfg;
  const clear = new Set(cfg.clear);

  // THE one coordinate map. Every read below goes through it — the ink test and the pixel copy.
  const mapX = cfg.mirror
    ? (x) => (x - box.x < box.w / 2 ? x : box.x + box.w - 1 - (x - box.x))
    : (x) => x;
  const rgbAt = (x, y) => {
    const i = (y * img.w + mapX(x)) * 4;
    return `${img.px[i]},${img.px[i + 1]},${img.px[i + 2]}`;
  };
  /** null when the pixel is background or interior fill — i.e. transparent in the sheet. */
  const at = (x, y) => (clear.has(rgbAt(x, y)) ? null : rgbAt(x, y));

  const ink0 = inkInsets(at, box);
  const ink = cfg.mirror ? { ...ink0, R: ink0.L } : ink0;
  const slice = solveSlice(at, box, ink);

  const sheetW = slice.L + PERIOD + slice.R;
  const sheetH = slice.T + PERIOD + slice.B;
  const px = new Uint8Array(sheetW * sheetH * 4);

  // Edge tiles sample the one period immediately after the corner, so the corner->tile junction
  // is seamless by construction under `round`.
  const srcX = (dx) =>
    dx < slice.L ? box.x + dx
    : dx < slice.L + PERIOD ? box.x + slice.L + (dx - slice.L)
    : box.x + box.w - (sheetW - dx);
  const srcY = (dy) =>
    dy < slice.T ? box.y + dy
    : dy < slice.T + PERIOD ? box.y + slice.T + (dy - slice.T)
    : box.y + box.h - (sheetH - dy);

  for (let dy = 0; dy < sheetH; dy++)
    for (let dx = 0; dx < sheetW; dx++) {
      const isCentre =
        dx >= slice.L && dx < slice.L + PERIOD && dy >= slice.T && dy < slice.T + PERIOD;
      if (isCentre) continue; // stays transparent — no `border-image-slice: fill`
      const sx = srcX(dx);
      const sy = srcY(dy);
      if (!at(sx, sy)) continue;
      const i = (sy * img.w + mapX(sx)) * 4;
      const o = (dy * sheetW + dx) * 4;
      px.set([img.px[i], img.px[i + 1], img.px[i + 2], 255], o);
    }

  const buf = encodePNG(sheetW, sheetH, px);
  writeFileSync(join(OUT_DIR, `${name}.png`), buf);

  // Guards: the invariants src/lib/frames/spec.test.ts also asserts.
  if (slice.L !== slice.R || ink.L !== ink.R) throw new Error(`${name}: ring is not symmetric`);
  if (slice.T < ink.T || slice.L < ink.L) throw new Error(`${name}: slice is thinner than its ink`);
  if (buf.length > 1024) throw new Error(`${name}: ${buf.length}B exceeds the 1 KB budget`);

  summary.push({ frame: name, ink: fmt(ink), slice: fmt(slice), sheet: `${sheetW}x${sheetH}`, bytes: buf.length });
}

function fmt(o) {
  return `${o.T}/${o.R}/${o.B}/${o.L}`;
}

console.table(summary);
console.log(`\nWrote ${summary.length} frames to public/frames/ (period ${PERIOD}, T/R/B/L order).`);
console.log("Copy these ink + slice numbers into FRAMES in src/lib/frames/spec.ts.");
