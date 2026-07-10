// The calendar's only write path. Mirrors the read seam (queries.ts): components
// never touch Dexie or Supabase directly. Writes go local-first + through the M2
// outbox (`markDirty` schedules the debounced flush); the sync engine pushes them.
"use client";

import { db } from "@/lib/db";
import type { Profile } from "@/lib/db/types";
import { createClient } from "@/lib/supabase/browser";
import { markDirty } from "@/lib/sync/engine";

/**
 * Persist the week-start preference (US-4). Updates the local `profiles` row with a
 * fresh client `updated_at`, then marks it dirty so the M2 engine syncs it. When no
 * local profile exists yet (rare — the first pull creates one), a minimal row is
 * synthesized against the signed-in user.
 */
export async function setStartOfWeek(startOfWeek: number): Promise<void> {
  const now = new Date().toISOString();
  const existing = await db.profiles.toCollection().first();

  let userId = existing?.user_id;
  if (!userId) {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Cannot set week-start without a signed-in user.");
    userId = user.id;
  }

  const row: Profile = existing
    ? { ...existing, start_of_week: startOfWeek, updated_at: now }
    : {
        user_id: userId,
        start_of_week: startOfWeek,
        selected_frame: "rse",
        fireworks_seen: false,
        created_at: now,
        updated_at: now,
      };

  await db.profiles.put(row);
  await markDirty("profiles", userId, "upsert");
}
