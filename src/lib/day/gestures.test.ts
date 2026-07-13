// The day page's gesture machine (ALG-9). Pure — it takes page-pixel points and emits
// select / tap / change / commit. The rules under test are the promises US-8 makes:
//   · selection is the GATE (an unselected stamp cannot be moved)
//   · a short tap toggles front/back on ANY stamp
//   · a twist snaps to 45° on release, and lands on a legal rotation_deg
//   · nothing can be dragged or pinched off the page
//   · EXACTLY ONE write per gesture, on gesture-end

import { beforeEach, describe, expect, test, vi } from "vitest";

import type { Stamp } from "@/lib/db/types";
import {
  DayGestures,
  LONG_PRESS_MS,
  WHEEL_COMMIT_MS,
  type LiveTransform,
} from "./gestures";
import { stampBoxes } from "./layout";
import { isInsidePage, placeStamp } from "./place";

const PAGE_W = 700;
const ASPECTS = new Map([["img1", 1]]);

function stamp(over: Partial<Stamp>): Stamp {
  return {
    id: "s1",
    entry_id: "e1",
    user_id: "u1",
    image_id: "img1",
    mask_type: "heart",
    pos_x: 0.5,
    pos_y: 0.5,
    scale: 0.4,
    rotation_deg: 0,
    layer_order: 1,
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-01T00:00:00.000Z",
    deleted_at: null,
    ...over,
  };
}

type Spy = {
  g: DayGestures;
  commits: LiveTransform[];
  taps: string[];
  selects: string[];
  deselects: string[];
};

function machine(stamps: Stamp[], selected: string | null): Spy {
  const spy: Spy = {
    g: null as unknown as DayGestures,
    commits: [],
    taps: [],
    selects: [],
    deselects: [],
  };
  spy.g = new DayGestures({
    onChange: () => {},
    onCommit: (t) => spy.commits.push(t),
    onTap: (id) => spy.taps.push(id),
    onSelect: (id) => spy.selects.push(id),
    onDeselect: () => spy.deselects.push("deselect"),
  });
  spy.g.setContext(stampBoxes(stamps, ASPECTS, PAGE_W), PAGE_W, selected);
  return spy;
}

/** The center of a stamp, in page pixels. */
function centerOf(stamps: Stamp[], id: string): { x: number; y: number } {
  const box = stampBoxes(stamps, ASPECTS, PAGE_W).find((b) => b.id === id)!;
  return { x: box.cx, y: box.cy };
}

beforeEach(() => {
  vi.useFakeTimers();
});

describe("selection", () => {
  test("a long-press selects the stamp under the finger", () => {
    const day = [stamp({})];
    const m = machine(day, null);
    m.g.pointerDown(1, centerOf(day, "s1"));
    vi.advanceTimersByTime(LONG_PRESS_MS + 10);
    expect(m.selects).toEqual(["s1"]);
  });

  test("moving past the slop cancels the long-press (a drag is not a select)", () => {
    const day = [stamp({})];
    const c = centerOf(day, "s1");
    const m = machine(day, null);
    m.g.pointerDown(1, c);
    m.g.pointerMove(1, { x: c.x + 30, y: c.y });
    vi.advanceTimersByTime(LONG_PRESS_MS + 10);
    expect(m.selects).toEqual([]);
  });

  test("a tap on empty page space deselects", () => {
    const m = machine([stamp({ scale: 0.2 })], "s1");
    m.g.pointerDown(1, { x: 4, y: 4 });
    m.g.pointerUp(1);
    expect(m.deselects).toHaveLength(1);
  });
});

describe("selection is the gate", () => {
  test("an UNSELECTED stamp cannot be dragged (a fat thumb can't knock it askew)", () => {
    const day = [stamp({})];
    const c = centerOf(day, "s1");
    const m = machine(day, null); // nothing selected
    m.g.pointerDown(1, c);
    m.g.pointerMove(1, { x: c.x + 120, y: c.y + 40 });
    m.g.pointerUp(1);
    expect(m.commits).toEqual([]);
  });

  test("the SELECTED stamp drags, and commits exactly once, on gesture-end", () => {
    const day = [stamp({})];
    const c = centerOf(day, "s1");
    const m = machine(day, "s1");
    m.g.pointerDown(1, c);
    for (let i = 1; i <= 20; i++) m.g.pointerMove(1, { x: c.x + i * 3, y: c.y + i });
    expect(m.commits).toHaveLength(0); // …never per animation frame
    m.g.pointerUp(1);
    expect(m.commits).toHaveLength(1);
    expect(m.commits[0].pos_x).toBeGreaterThan(0.5);
  });
});

describe("tap = front/back", () => {
  test("a short tap on any stamp (selected or not) toggles front/back, without selecting", () => {
    const day = [stamp({})];
    const c = centerOf(day, "s1");

    const unselected = machine(day, null);
    unselected.g.pointerDown(1, c);
    unselected.g.pointerUp(1);
    expect(unselected.taps).toEqual(["s1"]);
    expect(unselected.selects).toEqual([]);

    const selected = machine(day, "s1");
    selected.g.pointerDown(1, c);
    selected.g.pointerUp(1);
    expect(selected.taps).toEqual(["s1"]); // …and keeps the selection (no deselect fired)
    expect(selected.deselects).toHaveLength(0);
  });
});

describe("pinch / twist", () => {
  test("a twist snaps to 45° on release and lands on a legal rotation_deg", () => {
    const legal = [0, 45, 90, 135, 180, 225, 270, 315];
    const day = [stamp({ scale: 0.3 })];
    const c = centerOf(day, "s1");
    const m = machine(day, "s1");

    m.g.pointerDown(1, { x: c.x - 40, y: c.y });
    m.g.pointerDown(2, { x: c.x + 40, y: c.y });
    // Twist BOTH fingers ~30° about the stamp's center (the distance between them is
    // unchanged, so this is a pure rotation).
    const rad = (30 * Math.PI) / 180;
    const dx = 40 * Math.cos(rad);
    const dy = 40 * Math.sin(rad);
    m.g.pointerMove(1, { x: c.x - dx, y: c.y - dy });
    m.g.pointerMove(2, { x: c.x + dx, y: c.y + dy });
    m.g.pointerUp(2);
    m.g.pointerUp(1);

    expect(m.commits).toHaveLength(1);
    expect(legal).toContain(m.commits[0].rotation_deg);
    expect(m.commits[0].rotation_deg).toBe(45); // nearest 45 to ~30°
  });

  test("a huge pinch-out cannot scale the stamp off the page", () => {
    const day = [stamp({ scale: 0.3 })];
    const c = centerOf(day, "s1");
    const m = machine(day, "s1");

    m.g.pointerDown(1, { x: c.x - 10, y: c.y });
    m.g.pointerDown(2, { x: c.x + 10, y: c.y });
    m.g.pointerMove(2, { x: c.x + 4000, y: c.y }); // spread the fingers absurdly far
    m.g.pointerUp(2);
    m.g.pointerUp(1);

    const t = m.commits[0];
    expect(
      isInsidePage({ x: t.pos_x, y: t.pos_y }, t.scale, 1, t.rotation_deg),
    ).toBe(true);
  });

  test("a wild drag cannot push the stamp off the page", () => {
    const day = [stamp({ ...placeStamp([], 1)! })];
    const c = centerOf(day, "s1");
    const m = machine(day, "s1");
    m.g.pointerDown(1, c);
    m.g.pointerMove(1, { x: c.x + 5000, y: c.y + 5000 });
    m.g.pointerUp(1);

    const t = m.commits[0];
    expect(
      isInsidePage({ x: t.pos_x, y: t.pos_y }, t.scale, 1, t.rotation_deg),
    ).toBe(true);
  });
});

// A mouse has no second finger: these are the ONLY way scale and rotate are reachable on
// desktop. They must produce the same data (and obey the same clamps) as the touch gestures.
describe("desktop controls", () => {
  test("selection is the gate for the mouse too: no selection → the buttons and wheel no-op", () => {
    const m = machine([stamp({})], null);
    m.g.scaleStep(1);
    m.g.rotateStep(1);
    m.g.wheel(-100);
    expect(m.commits).toEqual([]);
  });

  test("a rotate click is one 45° step, and lands on a legal rotation_deg", () => {
    const legal = [0, 45, 90, 135, 180, 225, 270, 315];
    const m = machine([stamp({ scale: 0.3, rotation_deg: 0 })], "s1");
    m.g.rotateStep(1);
    expect(m.commits[0].rotation_deg).toBe(45);
    expect(legal).toContain(m.commits[0].rotation_deg);

    const back = machine([stamp({ scale: 0.3, rotation_deg: 0 })], "s1");
    back.g.rotateStep(-1); // through zero, the long way round
    expect(legal).toContain(back.commits[0].rotation_deg);
    expect(back.commits[0].rotation_deg).toBe(315);
  });

  test("a scale click writes once and cannot scale the stamp off the page", () => {
    const day = [stamp({ scale: 0.3 })];
    const m = machine(day, "s1");
    m.g.scaleStep(1);
    expect(m.commits).toHaveLength(1);
    expect(m.commits[0].scale).toBeGreaterThan(0.3);

    // Hammer it: even 40 clicks up stay on the page (clamped at max-fit).
    const hammer = machine(day, "s1");
    for (let i = 0; i < 40; i++) hammer.g.scaleStep(1);
    const t = hammer.commits.at(-1)!;
    expect(isInsidePage({ x: t.pos_x, y: t.pos_y }, t.scale, 1, t.rotation_deg)).toBe(true);
  });

  test("the wheel scales live but writes ONCE, after the wheel goes quiet", () => {
    const m = machine([stamp({ scale: 0.3 })], "s1");
    for (let i = 0; i < 12; i++) m.g.wheel(-100);
    expect(m.commits).toHaveLength(0); // …not one write per notch

    vi.advanceTimersByTime(WHEEL_COMMIT_MS + 10);
    expect(m.commits).toHaveLength(1);
    expect(m.commits[0].scale).toBeGreaterThan(0.3);
  });

  test("a wheel gesture that is still moving keeps deferring its single write", () => {
    const m = machine([stamp({ scale: 0.3 })], "s1");
    m.g.wheel(-100);
    vi.advanceTimersByTime(WHEEL_COMMIT_MS - 50);
    m.g.wheel(-100); // still scrolling → the pending commit is pushed back
    vi.advanceTimersByTime(WHEEL_COMMIT_MS - 50);
    expect(m.commits).toHaveLength(0);
    vi.advanceTimersByTime(60);
    expect(m.commits).toHaveLength(1);
  });

  test("a drag still works right after a desktop nudge (the nudge leaves no dirty state)", () => {
    const day = [stamp({ scale: 0.3 })];
    const c = centerOf(day, "s1");
    const m = machine(day, "s1");
    m.g.rotateStep(1);
    expect(m.commits).toHaveLength(1);

    m.g.pointerDown(1, c);
    m.g.pointerMove(1, { x: c.x + 60, y: c.y });
    m.g.pointerUp(1);
    expect(m.commits).toHaveLength(2);
    expect(m.commits[1].pos_x).toBeGreaterThan(m.commits[0].pos_x);
  });
});
