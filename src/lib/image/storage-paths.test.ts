import { expect, test } from "vitest";

import { mainPath, thumbPath } from "./storage-paths";

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
