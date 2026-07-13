// The sticker-alpha regression (found on a real phone: every placed sticker rendered as a BLACK
// BOX).
//
// The cause was one line: `processImage` encoded every thumb as JPEG. JPEG has no alpha channel,
// so a sticker's transparent pixels composited to black — and the sticker layer draws from 256px
// THUMBS (M7 decision 15), so that is what she saw. Photos were fine (no alpha to lose) and so
// were stamps (the day page draws their WebP closeups), which is why nothing caught it until M7.
//
// The rule, in one sentence: **a thumb must carry the same alpha its main does.**

import { describe, expect, test } from "vitest";

import { thumbEncoding } from "./process";
import { mainPath, thumbPath } from "./storage-paths";

describe("a sticker keeps its transparency end to end", () => {
  test("its thumb is encoded as PNG — never JPEG", () => {
    expect(thumbEncoding("sticker").type).toBe("image/png");
  });

  test("…and its thumb is STORED as a .png, so the uploaded object keeps the alpha too", () => {
    expect(thumbPath("uid", "img1", "sticker")).toBe("uid/img1_thumb.png");
    expect(mainPath("uid", "img1", "sticker")).toBe("uid/img1.png");
  });
});

describe("a photo is unchanged by the fix", () => {
  test("its thumb is still JPEG (no alpha to lose; PNG would balloon it)", () => {
    expect(thumbEncoding("photo")).toEqual({ type: "image/jpeg", quality: 0.7 });
    expect(thumbPath("uid", "img1", "photo")).toBe("uid/img1_thumb.jpg");
    expect(thumbPath("uid", "img1")).toBe("uid/img1_thumb.jpg"); // the default
  });
});
