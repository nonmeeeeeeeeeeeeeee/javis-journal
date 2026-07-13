// The sticker gesture machine + THE FOUR ISOLATION CASES (M7 DoD, Tier 1).
//
// The sticker layer sits on top of a calendar that already owns both gestures a sticker wants:
// one finger scrolls the close-up month, two fingers switch the view. Selection is the gate that
// makes the layer safe, so these four are the milestone's load-bearing rules:
//
//   1. a two-finger pinch on a SELECTED sticker does not switch the calendar view
//   2. a one-finger drag on a SELECTED sticker does not scroll the close-up month
//   3. a wheel over a SELECTED sticker does not scroll the scroller
//   4. an UNSELECTED sticker does not block a tap from opening the day underneath it
//
// Cases 1–3 are "who owns the gesture" questions, and the answer is a single predicate the
// Calendar and the layer share; case 4 is a routing question the layer answers with
// `dateAtGridPoint`. All four are asserted here, plus the machine's own promises (the selection
// gate, the 45° snap, and EXACTLY ONE write per gesture).

import { beforeEach, describe, expect, test, vi } from "vitest";

import { pinchDecision, PINCH_RATIO, SPREAD_RATIO } from "@/lib/calendar/pinch";
import type { PlacedSticker } from "@/lib/db/types";
import type { LiveTransform } from "@/lib/gestures/machine";
import { dateAtGridPoint } from "./cell";
import { StickerGestures, LONG_PRESS_MS, WHEEL_COMMIT_MS } from "./gestures";
import { gridHeight, stickerBoxes } from "./layout";
import { isInsideGrid } from "./place";

const GRID_W = 700;
const GRID_H = gridHeight(GRID_W);
const ASPECTS = new Map([["img1", 1]]);

function sticker(over: Partial<PlacedSticker> = {}): PlacedSticker {
  return {
    id: "s1",
    user_id: "u1",
    image_id: "img1",
    sticker_asset_id: "a1",
    year_month: "2026-07",
    pos_x: 0.5,
    pos_y: 0.5,
    scale: 0.2,
    rotation_deg: 0,
    layer_order: 1,
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-01T00:00:00.000Z",
    deleted_at: null,
    ...over,
  };
}

type Harness = {
  g: StickerGestures;
  commits: LiveTransform[];
  taps: string[];
  selects: string[];
  deselects: number;
};

function harness(stickers: PlacedSticker[], selected: string | null): Harness {
  const commits: LiveTransform[] = [];
  const taps: string[] = [];
  const selects: string[] = [];
  let deselects = 0;

  const g = new StickerGestures({
    onChange: () => {},
    onCommit: (t) => commits.push(t),
    onTap: (id) => taps.push(id),
    onSelect: (id) => selects.push(id),
    onDeselect: () => {
      deselects += 1;
    },
  });
  g.setContext(stickerBoxes(stickers, ASPECTS, GRID_W), GRID_W, selected);

  return {
    g,
    commits,
    taps,
    selects,
    get deselects() {
      return deselects;
    },
  } as Harness;
}

/** The center of the one sticker, in grid pixels. */
const CENTER = { x: 0.5 * GRID_W, y: 0.5 * GRID_H };

beforeEach(() => {
  vi.useFakeTimers();
});

describe("isolation case 1 — a pinch on a selected sticker never switches the view", () => {
  test("the calendar's pinch decision is null whenever an editor owns the gesture", () => {
    // The Calendar passes `dayOpen || stickerSelected` — one predicate, two owners.
    for (const ratio of [SPREAD_RATIO + 0.5, PINCH_RATIO - 0.3, 1]) {
      expect(pinchDecision(ratio, true)).toBeNull();
    }
    // …and with nothing selected the calendar still switches, exactly as it does today.
    expect(pinchDecision(SPREAD_RATIO + 0.1, false)).toBe("close-up");
    expect(pinchDecision(PINCH_RATIO - 0.1, false)).toBe("full-month");
  });

  test("the pinch scales the SELECTED sticker instead, committing once", () => {
    const h = harness([sticker()], "s1");

    h.g.pointerDown(1, CENTER);
    vi.advanceTimersByTime(LONG_PRESS_MS + 10);
    h.g.pointerDown(2, { x: CENTER.x + 40, y: CENTER.y });
    h.g.pointerMove(2, { x: CENTER.x + 120, y: CENTER.y }); // spread → bigger
    h.g.pointerUp(2);
    h.g.pointerUp(1);

    expect(h.commits).toHaveLength(1);
    expect(h.commits[0].scale).toBeGreaterThan(0.2);
  });
});

describe("isolation case 2 — a drag on a selected sticker never scrolls the month", () => {
  test("the drag moves the sticker (one write, on gesture-end) and stays inside the grid", () => {
    const h = harness([sticker()], "s1");

    h.g.pointerDown(1, CENTER);
    h.g.pointerMove(1, { x: CENTER.x + 60, y: CENTER.y + 30 });
    h.g.pointerMove(1, { x: CENTER.x + 120, y: CENTER.y + 60 });
    h.g.pointerUp(1);

    expect(h.commits).toHaveLength(1); // never one per frame
    const t = h.commits[0];
    expect(t.pos_x).toBeGreaterThan(0.5);
    expect(isInsideGrid({ x: t.pos_x, y: t.pos_y }, t.scale, 1, t.rotation_deg)).toBe(true);
  });

  test("…and a drag on an UNSELECTED sticker moves nothing (the month scrolls instead)", () => {
    const h = harness([sticker()], null);

    h.g.pointerDown(1, CENTER);
    h.g.pointerMove(1, { x: CENTER.x + 120, y: CENTER.y + 60 });
    h.g.pointerUp(1);

    expect(h.commits).toHaveLength(0);
  });
});

describe("isolation case 3 — a wheel over a selected sticker never scrolls the scroller", () => {
  test("the wheel scales it live, and writes ONCE when the wheel goes quiet", () => {
    const h = harness([sticker()], "s1");

    h.g.wheel(-100);
    h.g.wheel(-100);
    h.g.wheel(-100);
    expect(h.commits).toHaveLength(0); // still spinning — no write yet

    vi.advanceTimersByTime(WHEEL_COMMIT_MS + 10);
    expect(h.commits).toHaveLength(1);
    expect(h.commits[0].scale).toBeGreaterThan(0.2);
  });

  test("with nothing selected the wheel does nothing at all (the month scrolls)", () => {
    const h = harness([sticker()], null);
    h.g.wheel(-100);
    vi.advanceTimersByTime(WHEEL_COMMIT_MS + 10);
    expect(h.commits).toHaveLength(0);
  });
});

describe("isolation case 4 — an unselected sticker does not block the day underneath", () => {
  test("a short tap on it resolves to the day it is sitting on", () => {
    const h = harness([sticker()], null);

    h.g.pointerDown(1, CENTER);
    h.g.pointerUp(1);

    // The machine reports the tap; the layer routes it to the day, rather than treating it as
    // the sticker's own (front/back is only reachable on a SELECTED sticker).
    expect(h.taps).toEqual(["s1"]);
    expect(h.selects).toEqual([]);
    // The sticker sits at the middle of the grid, so the tap belongs to the day drawn there.
    expect(dateAtGridPoint(CENTER, GRID_W, 2026, 7, 1)).toBe("2026-07-23");
  });

  test("a LONG press on it selects the sticker instead (the documented cost)", () => {
    const h = harness([sticker()], null);

    h.g.pointerDown(1, CENTER);
    vi.advanceTimersByTime(LONG_PRESS_MS + 10);
    h.g.pointerUp(1);

    expect(h.selects).toEqual(["s1"]);
  });
});

describe("the machine's own promises, on the sticker surface", () => {
  test("a twist snaps to a legal rotation_deg on release", () => {
    const h = harness([sticker()], "s1");

    h.g.pointerDown(1, CENTER);
    vi.advanceTimersByTime(LONG_PRESS_MS + 10);
    h.g.pointerDown(2, { x: CENTER.x + 60, y: CENTER.y });
    h.g.pointerMove(2, { x: CENTER.x, y: CENTER.y + 60 }); // ~90° twist
    h.g.pointerUp(2);
    h.g.pointerUp(1);

    expect([0, 45, 90, 135, 180, 225, 270, 315]).toContain(h.commits[0].rotation_deg);
  });

  test("a tap on empty grid space deselects", () => {
    const h = harness([sticker()], "s1");
    h.g.pointerDown(1, { x: 5, y: 5 }); // the far corner — no sticker there
    h.g.pointerUp(1);
    expect(h.deselects).toBe(1);
  });

  test("a desktop rotate step is one write, and lands on a legal value", () => {
    const h = harness([sticker()], "s1");
    h.g.rotateStep(1);
    expect(h.commits).toHaveLength(1);
    expect(h.commits[0].rotation_deg).toBe(45);
  });
});
