import { describe, expect, test } from "vitest";

import { PINCH_RATIO, SPREAD_RATIO, pinchDecision } from "./pinch";

describe("pinchDecision", () => {
  test("with no day open, a spread switches to close-up and a pinch to full-month", () => {
    expect(pinchDecision(SPREAD_RATIO + 0.1, false)).toBe("close-up");
    expect(pinchDecision(PINCH_RATIO - 0.1, false)).toBe("full-month");
  });

  test("a small squeeze below the thresholds does nothing (no twitchy switching)", () => {
    expect(pinchDecision(1.05, false)).toBeNull();
    expect(pinchDecision(0.95, false)).toBeNull();
  });

  test("PINCH ISOLATION: with a day open, NO pinch ever switches the calendar view", () => {
    for (const ratio of [0.1, 0.5, PINCH_RATIO - 0.1, 1, SPREAD_RATIO + 0.1, 3, 10]) {
      expect(pinchDecision(ratio, true)).toBeNull();
    }
  });
});
