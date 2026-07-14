import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import {
  DEFAULT_FRAME,
  FRAMES,
  FRAME_IDS,
  frameBoxInsets,
  frameInsets,
  frameScale,
} from "./spec";
import { frameCss } from "./style";

/** IHDR width/height + byte size of a shipped asset. Enough to prove the spec matches the PNG. */
function readPng(src: string) {
  const buf = readFileSync(join(process.cwd(), "public", src.replace(/^\//, "")));
  expect(buf.subarray(1, 4).toString("ascii")).toBe("PNG");
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20), bytes: buf.length };
}

describe.each(FRAME_IDS)("FRAMES.%s", (id) => {
  const spec = FRAMES[id];

  test("the sheet is exactly corner | one period | corner on both axes", () => {
    expect(spec.slice.l + spec.period + spec.slice.r).toBe(spec.sheetW);
    expect(spec.slice.t + spec.period + spec.slice.b).toBe(spec.sheetH);
  });

  test("every inset is positive", () => {
    for (const side of ["t", "r", "b", "l"] as const) {
      expect(spec.ink[side]).toBeGreaterThan(0);
      expect(spec.slice[side]).toBeGreaterThan(0);
    }
    expect(spec.period).toBeGreaterThan(0);
  });

  test("slice >= ink on every side — the surplus is what outset bleeds outward", () => {
    for (const side of ["t", "r", "b", "l"] as const) {
      expect(spec.slice[side]).toBeGreaterThanOrEqual(spec.ink[side]);
    }
  });

  test("the ring is symmetric (decision 4 — the extractor mirrors the lopsided sources)", () => {
    expect(spec.slice.l).toBe(spec.slice.r);
    expect(spec.slice.t).toBe(spec.slice.b);
    expect(spec.ink.l).toBe(spec.ink.r);
    expect(spec.ink.t).toBe(spec.ink.b);
  });

  test("the spec matches the asset actually shipped in public/frames", () => {
    const png = readPng(spec.src);
    expect({ w: png.w, h: png.h }).toEqual({ w: spec.sheetW, h: spec.sheetH });
    // A 9-slice tile sheet is meant to cost nothing: ≤ 1 KB per frame (decision 9).
    expect(png.bytes).toBeLessThanOrEqual(1024);
  });
});

describe("frame helpers", () => {
  test("the default frame is the column's own default", () => {
    expect(DEFAULT_FRAME).toBe("rse");
    expect(FRAMES[DEFAULT_FRAME]).toBeDefined();
  });

  test("frameScale steps ×2 phone / ×3 tablet / ×4 desktop, integers only", () => {
    expect(frameScale(390)).toBe(2);
    expect(frameScale(639)).toBe(2);
    expect(frameScale(640)).toBe(3);
    expect(frameScale(768)).toBe(3);
    expect(frameScale(1023)).toBe(3);
    expect(frameScale(1024)).toBe(4);
    expect(frameScale(1440)).toBe(4);
  });

  test("frameInsets costs layout the ink only, never the fatter slice", () => {
    // hgss_15: ink 10 wide / 6 tall, but slice 16 / 7 — the 6px and 1px surpluses are outset.
    expect(frameInsets("hgss_15", 2)).toEqual({ w: 20, h: 12 });
    expect(frameInsets("hgss_18", 2)).toEqual({ w: 22, h: 8 });
    expect(frameInsets("rse", 4)).toEqual({ w: 24, h: 24 });
  });

  test("'none' costs layout nothing and draws nothing", () => {
    // The bare calendar. `frameBoxInsets` is what fit.ts consumes as its documented `0 = no
    // frame`, so these three zeroes ARE the "no reflow when she takes the frame off" guarantee.
    for (const scale of [2, 3, 4]) {
      expect(frameInsets("none", scale)).toEqual({ w: 0, h: 0 });
      expect(frameBoxInsets("none", scale)).toEqual({ w: 0, h: 0 });
      expect(frameCss("none", scale)).toEqual({}); // no border, no mat, no image
    }
  });

  test("every frame's ink fits inside fit.ts's 24px gutter at phone scale (×2)", () => {
    // The "never fights her" invariant: the ring lives in the gutter that already exists, so
    // it costs the phone grid zero cells. If a re-export fattens a frame past this, it starts
    // eating cells — and this test, not Javi, finds out.
    for (const id of FRAME_IDS) {
      const { w, h } = frameInsets(id, 2);
      expect(w).toBeLessThanOrEqual(24);
      expect(h).toBeLessThanOrEqual(24);
    }
  });
});
