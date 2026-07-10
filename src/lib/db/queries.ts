// The ONLY place UI components read Dexie. Mirrors how thumb-url.ts is the sole
// image-read seam. Everything here is a reactive hook (dexie-react-hooks
// `useLiveQuery`) so a sync pull or a future day edit re-renders the calendar for
// free. Week-start *writes* live in ./mutations.ts and go through the M2 outbox.
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";

import { db } from "@/lib/db";
import type { Profile, Stamp } from "@/lib/db/types";
import { getThumbUrls, type ThumbHandle } from "@/lib/image/thumb-url";
import { monthRange } from "@/lib/calendar/month-grid";

/** One day's representative content for the grid. */
export type DayData = {
  date: string;
  /** Top-`layer_order` live (non-deleted) stamp for the day, or null. */
  stamp: Stamp | null;
  /** Resolved 256px thumb URL for that stamp, or null (unresolved / none). */
  thumbUrl: string | null;
};

/**
 * Pick the representative stamp for a day: the max `layer_order` among non-deleted
 * stamps. Ties break on `id` for determinism (Dexie array order isn't guaranteed).
 * Returns null when there is no live stamp. Pure — exported for unit tests.
 */
export function pickTopStamp(stamps: Stamp[]): Stamp | null {
  let top: Stamp | null = null;
  for (const s of stamps) {
    if (s.deleted_at != null) continue;
    if (
      top === null ||
      s.layer_order > top.layer_order ||
      (s.layer_order === top.layer_order && s.id > top.id)
    ) {
      top = s;
    }
  }
  return top;
}

/**
 * Reactive read of one month's day content, keyed by `YYYY-MM-DD`. Range-scans
 * `entries` for the month, picks each day's top live stamp, and batch-resolves all
 * their thumbs in a single `getThumbUrls` round-trip. Every `ThumbHandle` created is
 * released when the month unmounts or its stamp set changes (ALG-6, the freeze fix).
 */
export function useMonthData(year: number, month: number): Map<string, DayData> {
  const { start, endExclusive } = monthRange(year, month);

  // Reactive: date -> top live stamp. Re-fires on any entries/stamps mutation.
  const stampsByDate = useLiveQuery(
    async (): Promise<Map<string, Stamp>> => {
      const entries = await db.entries
        .where("entry_date")
        .between(start, endExclusive, true, false)
        .toArray();
      if (entries.length === 0) return new Map();

      const dateByEntryId = new Map(entries.map((e) => [e.id, e.entry_date]));
      const stamps = await db.stamps
        .where("entry_id")
        .anyOf([...dateByEntryId.keys()])
        .toArray();

      const byEntry = new Map<string, Stamp[]>();
      for (const s of stamps) {
        const list = byEntry.get(s.entry_id);
        if (list) list.push(s);
        else byEntry.set(s.entry_id, [s]);
      }

      const byDate = new Map<string, Stamp>();
      for (const [entryId, list] of byEntry) {
        const top = pickTopStamp(list);
        const date = dateByEntryId.get(entryId);
        if (top && date) byDate.set(date, top);
      }
      return byDate;
    },
    [start, endExclusive],
    new Map<string, Stamp>(),
  );

  // date -> resolved thumb url. Object-URL handles held for disciplined release.
  const [thumbUrls, setThumbUrls] = useState<Map<string, string>>(new Map());
  const handlesRef = useRef<ThumbHandle[]>([]);

  useEffect(() => {
    let cancelled = false;

    const imageIdByDate = new Map<string, string>();
    for (const [date, stamp] of stampsByDate) {
      imageIdByDate.set(date, stamp.image_id);
    }
    const ids = [...new Set(imageIdByDate.values())];

    void getThumbUrls(ids).then((handleMap) => {
      if (cancelled) {
        for (const h of handleMap.values()) h.release();
        return;
      }
      // Release the previous month/stamp-set's handles before adopting the new set.
      for (const h of handlesRef.current) h.release();
      handlesRef.current = [...handleMap.values()];

      const next = new Map<string, string>();
      for (const [date, imageId] of imageIdByDate) {
        const handle = handleMap.get(imageId);
        if (handle) next.set(date, handle.url);
      }
      setThumbUrls(next);
    });

    return () => {
      cancelled = true;
    };
  }, [stampsByDate]);

  // Release everything on unmount (the load-bearing ALG-6 obligation).
  useEffect(
    () => () => {
      for (const h of handlesRef.current) h.release();
      handlesRef.current = [];
    },
    [],
  );

  return useMemo(() => {
    const out = new Map<string, DayData>();
    for (const [date, stamp] of stampsByDate) {
      out.set(date, { date, stamp, thumbUrl: thumbUrls.get(date) ?? null });
    }
    return out;
  }, [stampsByDate, thumbUrls]);
}

/** Normalized view of the local profile row for calendar chrome. */
export type ProfileView = {
  /** ISO week-start (1 = Mon … 7 = Sun). Defaults to 1 (Mon) until a row exists. */
  startOfWeek: number;
  /** The row's user_id, or null before the first pull writes a profile row. */
  userId: string | null;
  /** False only during the very first (undefined) live-query tick. */
  loaded: boolean;
};

/**
 * Reactive read of the local profile row, defaulting `start_of_week = 1` (Mon) when
 * no row exists yet (first load before pull). Re-fires when sync writes the profile.
 */
export function useProfile(): ProfileView {
  const row = useLiveQuery<Profile | undefined>(
    () => db.profiles.toCollection().first(),
    [],
  );

  return {
    startOfWeek: row?.start_of_week ?? 1,
    userId: row?.user_id ?? null,
    loaded: row !== undefined,
  };
}
