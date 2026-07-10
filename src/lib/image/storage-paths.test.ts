import { expect, test } from "vitest";

import { extForStampMime, mainPath, stampMainPath, stampThumbPath, thumbPath } from "./storage-paths";

test("photo main path is {uid}/{id}.jpg", () => {
  expect(mainPath("uid-1", "img-1", "photo")).toBe("uid-1/img-1.jpg");
});

test("sticker main path is {uid}/{id}.png", () => {
  expect(mainPath("uid-1", "img-1", "sticker")).toBe("uid-1/img-1.png");
});

test("thumb path is {uid}/{id}_thumb.jpg", () => {
  expect(thumbPath("uid-1", "img-1")).toBe("uid-1/img-1_thumb.jpg");
});

test("every path is rooted at uid so bucket RLS foldername[1] === uid", () => {
  expect(mainPath("U", "I", "photo").split("/")[0]).toBe("U");
  expect(mainPath("U", "I", "sticker").split("/")[0]).toBe("U");
  expect(thumbPath("U", "I").split("/")[0]).toBe("U");
});

test("paths are deterministic for the same inputs (idempotent overwrite)", () => {
  expect(mainPath("u", "i", "photo")).toBe(mainPath("u", "i", "photo"));
  expect(thumbPath("u", "i")).toBe(thumbPath("u", "i"));
});

// ---- M5 baked stamps (ADR-M5): WebP-alpha (or PNG fallback) for BOTH objects ----

test("baked stamp closeup + thumb are .webp for image/webp", () => {
  expect(stampMainPath("uid-1", "img-1", "image/webp")).toBe("uid-1/img-1.webp");
  expect(stampThumbPath("uid-1", "img-1", "image/webp")).toBe("uid-1/img-1_thumb.webp");
});

test("baked stamp falls back to .png when the bake mime is image/png", () => {
  expect(stampMainPath("uid-1", "img-1", "image/png")).toBe("uid-1/img-1.png");
  expect(stampThumbPath("uid-1", "img-1", "image/png")).toBe("uid-1/img-1_thumb.png");
});

test("extForStampMime maps the two bake mimes and defaults to webp", () => {
  expect(extForStampMime("image/webp")).toBe("webp");
  expect(extForStampMime("image/png")).toBe("png");
  expect(extForStampMime("image/jpeg")).toBe("webp"); // defensive default
});

test("baked stamp paths are rooted at uid so bucket RLS foldername[1] === uid", () => {
  expect(stampMainPath("U", "I", "image/webp").split("/")[0]).toBe("U");
  expect(stampThumbPath("U", "I", "image/webp").split("/")[0]).toBe("U");
});
