import { expect, test } from "vitest";

import { selectBakeMime, WEBP_QUALITY } from "./bake";

test("bake WebP quality is 0.8", () => {
  expect(WEBP_QUALITY).toBe(0.8);
});

test("format selection keeps WebP when the encoder produced WebP", () => {
  expect(selectBakeMime("image/webp")).toBe("image/webp");
});

test("format selection falls back to PNG when WebP is unsupported (silent png output)", () => {
  // Browsers that can't encode WebP emit image/png from convertToBlob('image/webp').
  expect(selectBakeMime("image/png")).toBe("image/png");
  expect(selectBakeMime("")).toBe("image/png");
  expect(selectBakeMime("image/jpeg")).toBe("image/png");
});
