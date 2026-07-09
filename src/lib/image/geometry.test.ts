import { describe, expect, test } from "vitest";

import { decodeTarget, fitLongestEdge, planStepDown, thumbDims } from "./geometry";

describe("fitLongestEdge", () => {
  test("portrait over cap scales the longest edge to the cap", () => {
    expect(fitLongestEdge(3000, 4000, 2048)).toEqual({ width: 1536, height: 2048 });
  });

  test("landscape over cap scales the longest edge to the cap", () => {
    expect(fitLongestEdge(4000, 3000, 2048)).toEqual({ width: 2048, height: 1536 });
  });

  test("square over cap", () => {
    expect(fitLongestEdge(4000, 4000, 2048)).toEqual({ width: 2048, height: 2048 });
  });

  test("sub-cap input is unchanged (never upscales)", () => {
    expect(fitLongestEdge(800, 600, 2048)).toEqual({ width: 800, height: 600 });
  });
});

describe("planStepDown pass count", () => {
  test("source within 2x of the target is a single pass", () => {
    expect(planStepDown({ width: 4000, height: 3000 }, { width: 2048, height: 1536 })).toEqual([
      { width: 2048, height: 1536 },
    ]);
  });

  test("a large source halves once before the final exact step", () => {
    expect(planStepDown({ width: 8192, height: 6144 }, { width: 2048, height: 1536 })).toEqual([
      { width: 4096, height: 3072 },
      { width: 2048, height: 1536 },
    ]);
  });

  test("thumbnailing a 2048px main takes multiple halving passes ending at the target", () => {
    const passes = planStepDown({ width: 2048, height: 1536 }, { width: 256, height: 192 });
    expect(passes.length).toBeGreaterThan(1);
    expect(passes[passes.length - 1]).toEqual({ width: 256, height: 192 });
  });
});

describe("thumbDims", () => {
  test("fits the longest edge to 256", () => {
    expect(thumbDims(2048, 1536)).toEqual({ width: 256, height: 192 });
    expect(thumbDims(1000, 2000)).toEqual({ width: 128, height: 256 });
  });
});

describe("decodeTarget", () => {
  test("under the area cap returns null (decode full-res)", () => {
    expect(decodeTarget(4000, 3000, 40_000_000)).toBeNull();
  });

  test("over the area cap returns reduced dims under the cap", () => {
    const dt = decodeTarget(10000, 8000, 40_000_000);
    expect(dt).not.toBeNull();
    expect(dt!.width * dt!.height).toBeLessThanOrEqual(40_000_000);
  });
});
