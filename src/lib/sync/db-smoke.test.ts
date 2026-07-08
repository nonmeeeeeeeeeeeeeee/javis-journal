import { afterEach, expect, test } from "vitest";

import { db } from "../db";

afterEach(async () => {
  await db.delete();
});

test("opens the journal database under fake-indexeddb", async () => {
  const entry = {
    id: "entry-1",
    user_id: "user-1",
    entry_date: "2026-07-08",
    created_at: "2026-07-08T00:00:00.000Z",
    updated_at: "2026-07-08T00:00:00.000Z",
  };

  await db.open();
  await db.entries.put(entry);

  await expect(db.entries.get(entry.id)).resolves.toEqual(entry);
});
