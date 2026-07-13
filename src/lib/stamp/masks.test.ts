import { expect, test } from "vitest";

import { MASK_IDS, MASKS, maskById } from "./masks";

test("ships exactly the 4 committed masks in cycle order", () => {
  expect(MASK_IDS).toEqual(["postage", "cloud", "spiky", "heart"]);
});

test("every mask has a positive intrinsic aspect and a path builder", () => {
  for (const mask of MASKS) {
    expect(mask.aspect).toBeGreaterThan(0);
    expect(typeof mask.path).toBe("function");
    expect(typeof mask.label).toBe("string");
  }
});

test("committed aspects are deterministic (coverage + placement depend on them)", () => {
  expect(maskById("postage").aspect).toBeCloseTo(3 / 4, 10);
  expect(maskById("cloud").aspect).toBeCloseTo(1.4, 10);
  expect(maskById("spiky").aspect).toBe(1);
  expect(maskById("heart").aspect).toBe(1);
});

test("a stamp is ONLY photo pixels + transparency — no mask paints ink on top", () => {
  // M6 removed postage's white perforated band: the perforation is in the alpha now, and the
  // overlay pass is gone from render.ts entirely. Nothing may reintroduce a fill style.
  for (const mask of MASKS) {
    expect(mask).not.toHaveProperty("frame");
    expect(mask).not.toHaveProperty("frameStyle");
  }
});

test("postage's alpha carries the perforation: OUTWARD scallops, inset so they aren't clipped", () => {
  const ds: string[] = [];
  const realPath2D = (globalThis as { Path2D?: unknown }).Path2D;
  (globalThis as { Path2D?: unknown }).Path2D = class {
    constructor(d: string) {
      ds.push(d);
    }
  };
  try {
    maskById("postage").path(300, 400);
  } finally {
    (globalThis as { Path2D?: unknown }).Path2D = realPath2D;
  }

  const d = ds.at(-1)!;
  expect(d).toMatch(/A[\d.]+ [\d.]+ 0 0 1 /); // sweep 1 → the scallops bulge outward

  // A FIXED count per edge — 6 across the short edges and 8 down the long ones, PLUS one at
  // each corner (so each edge is tiled by n + 2 chords). Fixed, because a radius-derived count
  // drifts with the box and reads differently at 256px than at 2048px.
  expect(d.match(/A/g)).toHaveLength(2 * (6 + 2) + 2 * (8 + 2));

  // …and the outline starts one bump in from the box, which is the ONLY reason those outward
  // scallops survive: un-inset, the canvas clips every crest and the stamp degenerates into a
  // bare rectangle (the bug this pins down).
  const [, x0, y0] = d.match(/^M([\d.]+) ([\d.]+)/)!;
  expect(Number(x0)).toBeGreaterThan(0);
  expect(Number(y0)).toBeGreaterThan(0);
  // The crests reach the box edges, so the stamp is still full-bleed.
  const xs = [...d.matchAll(/ ([\d.]+) ([\d.]+)/g)].map((m) => Number(m[1]));
  expect(Math.max(...xs)).toBeLessThanOrEqual(300);
  expect(Math.max(...xs)).toBeGreaterThan(300 - 2 * (300 * 0.045) - 1);
});

test("the star is a rounded 5-point star (10 quadratic corners, no sharp vertices)", () => {
  const ds: string[] = [];
  const realPath2D = (globalThis as { Path2D?: unknown }).Path2D;
  (globalThis as { Path2D?: unknown }).Path2D = class {
    constructor(d: string) {
      ds.push(d);
    }
  };
  try {
    maskById("spiky").path(256, 256);
  } finally {
    (globalThis as { Path2D?: unknown }).Path2D = realPath2D;
  }

  const d = ds.at(-1)!;
  // 5 tips + 5 valleys = 10 vertices, each rounded by exactly one quadratic.
  expect(d.match(/Q/g)).toHaveLength(10);
  expect(maskById("spiky").label).toBe("Star");
});

test("maskById throws on an unknown id", () => {
  // @ts-expect-error exercising the runtime guard with a bad id
  expect(() => maskById("triangle")).toThrow();
});

test("importing masks does not construct a Path2D (node has none)", () => {
  // Reaching here without a ReferenceError proves Path2D is only built inside path()/frame().
  expect(typeof Path2D).toBe("undefined");
});
