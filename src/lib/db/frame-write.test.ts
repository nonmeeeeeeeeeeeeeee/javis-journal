// M8's write path (US-10): choosing a frame updates the local profile row with a fresh client
// `updated_at` and marks it dirty — nothing else. The M2 engine does the rest, which is why the
// frame syncs to her other device for free.

import { beforeEach, describe, expect, test, vi } from "vitest";

import { db } from "@/lib/db";
import type { Profile } from "@/lib/db/types";
import { markDirty } from "@/lib/sync/engine";

vi.mock("@/lib/supabase/browser", () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) },
  }),
}));
vi.mock("@/lib/sync/engine", () => ({
  markDirty: vi.fn(async () => {}),
  scheduleFlush: vi.fn(),
}));

import { setSelectedFrame } from "./mutations";

const USER = "user-1";

function profileRow(overrides: Partial<Profile> = {}): Profile {
  return {
    user_id: USER,
    start_of_week: 7,
    selected_frame: "rse",
    fireworks_seen: false,
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("setSelectedFrame", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await db.profiles.clear();
  });

  test("writes the frame, bumps updated_at, and marks the row dirty", async () => {
    await db.profiles.put(profileRow());

    await setSelectedFrame("hgss_18");

    const row = await db.profiles.toCollection().first();
    expect(row?.selected_frame).toBe("hgss_18");
    expect(row?.updated_at).not.toBe("2026-07-01T00:00:00.000Z");
    expect(markDirty).toHaveBeenCalledWith("profiles", USER, "upsert");
  });

  test("leaves every other preference alone (it is a patch, not a replace)", async () => {
    await db.profiles.put(profileRow({ start_of_week: 7, fireworks_seen: true }));

    await setSelectedFrame("hgss_15");

    const row = await db.profiles.toCollection().first();
    expect(row?.start_of_week).toBe(7); // her Sunday stays Sunday
    expect(row?.fireworks_seen).toBe(true);
    expect(row?.created_at).toBe("2026-07-01T00:00:00.000Z");
  });

  test("synthesizes a profile against the signed-in user when none exists yet", async () => {
    // The first pull normally creates the row; picking a frame before that must still work.
    await setSelectedFrame("hgss_15");

    const row = await db.profiles.toCollection().first();
    expect(row).toMatchObject({
      user_id: USER,
      selected_frame: "hgss_15",
      start_of_week: 1,
    });
    expect(markDirty).toHaveBeenCalledWith("profiles", USER, "upsert");
  });

  test("a later choice wins (LWW is monotonic in updated_at)", async () => {
    await db.profiles.put(profileRow());

    await setSelectedFrame("hgss_15");
    const first = (await db.profiles.toCollection().first())!.updated_at;

    await new Promise((r) => setTimeout(r, 2));
    await setSelectedFrame("rse");
    const row = (await db.profiles.toCollection().first())!;

    expect(row.selected_frame).toBe("rse");
    expect(row.updated_at >= first).toBe(true);
  });

  test("'none' is a real stored choice, not an absence", async () => {
    await db.profiles.put(profileRow({ selected_frame: "hgss_15" }));

    await setSelectedFrame("none");

    const row = (await db.profiles.toCollection().first())!;
    expect(row.selected_frame).toBe("none");
    expect(markDirty).toHaveBeenCalledWith("profiles", USER, "upsert");
  });

  test("re-selecting the frame she already wears is a no-op — nothing is dirtied", async () => {
    // The menu's re-tap gesture turns a worn frame OFF, so it never reaches here with the same
    // value; a re-tapped 'none' does. Either way a double-tap must not spam the sync outbox.
    for (const frame of ["rse", "none"] as const) {
      await db.profiles.put(profileRow({ selected_frame: frame }));
      vi.clearAllMocks();

      await setSelectedFrame(frame);

      const row = (await db.profiles.toCollection().first())!;
      expect(row.updated_at).toBe("2026-07-01T00:00:00.000Z"); // untouched
      expect(markDirty).not.toHaveBeenCalled();
    }
  });
});
