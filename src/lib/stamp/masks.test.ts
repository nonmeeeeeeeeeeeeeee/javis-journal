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

test("only postage carries a perforated source-over frame", () => {
  expect(maskById("postage").frame).toBeTypeOf("function");
  expect(maskById("postage").frameStyle).toBe("#ffffff");
  expect(maskById("cloud").frame).toBeUndefined();
  expect(maskById("spiky").frame).toBeUndefined();
  expect(maskById("heart").frame).toBeUndefined();
});

test("maskById throws on an unknown id", () => {
  // @ts-expect-error exercising the runtime guard with a bad id
  expect(() => maskById("triangle")).toThrow();
});

test("importing masks does not construct a Path2D (node has none)", () => {
  // Reaching here without a ReferenceError proves Path2D is only built inside path()/frame().
  expect(typeof Path2D).toBe("undefined");
});
