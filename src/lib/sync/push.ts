import { db } from "@/lib/db";
import type { Entry, PlacedSticker, Profile, Stamp } from "@/lib/db/types";
import { createClient } from "@/lib/supabase/browser";
import {
  clearDirty,
  getPending,
  quarantine,
  type SyncTable,
} from "./outbox";

export { clearDirty, getPending, markDirty, quarantine } from "./outbox";

type SyncRow = Entry | Stamp | PlacedSticker | Profile;
type SupabaseClient = ReturnType<typeof createClient>;

const LWW_TABLES: SyncTable[] = [
  "entries",
  "stamps",
  "placed_stickers",
  "profiles",
];

export type FlushResult = {
  ok: true;
  pushed: number;
  quarantined: number;
};

export class PushNetworkError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "PushNetworkError";
  }
}

export async function flush(): Promise<FlushResult> {
  const supabase = createClient();

  let userResult;
  try {
    userResult = await supabase.auth.getUser();
  } catch (error) {
    throw new PushNetworkError("Network failure while resolving the current user.", {
      cause: error,
    });
  }

  const {
    data: { user },
    error: userError,
  } = userResult;

  if (userError) {
    throw new PushNetworkError("Unable to resolve the current Supabase user.", {
      cause: userError,
    });
  }

  if (!user) {
    throw new PushNetworkError("Cannot flush sync outbox without a signed-in user.");
  }

  let pushed = 0;
  let quarantined = 0;

  for (const table of LWW_TABLES) {
    const pending = await getPending(table);

    if (pending.length === 0) {
      continue;
    }

    const rows = await Promise.all(
      pending.map(async (outboxRow) => ({
        outboxRow,
        entityRow: await getEntityRow(table, outboxRow.rowId),
      })),
    );

    const pushableRows = rows.filter(
      (
        row,
      ): row is {
        outboxRow: (typeof rows)[number]["outboxRow"];
        entityRow: SyncRow;
      } => Boolean(row.entityRow),
    );

    const missingRows = rows.filter(({ entityRow }) => !entityRow);
    await Promise.all(
      missingRows.map(({ outboxRow }) =>
        quarantine(table, outboxRow.rowId, "Local entity row is missing."),
      ),
    );
    quarantined += missingRows.length;

    if (pushableRows.length === 0) {
      continue;
    }

    try {
      await upsertRows(
        supabase,
        table,
        pushableRows.map(({ entityRow }) => entityRow),
      );

      await Promise.all(
        pushableRows.map(({ outboxRow }) => clearDirty(table, outboxRow.rowId)),
      );
      pushed += pushableRows.length;
    } catch (error) {
      if (isNetworkError(error)) {
        throw error;
      }

      for (const { outboxRow, entityRow } of pushableRows) {
        try {
          await upsertRows(supabase, table, [entityRow]);
          await clearDirty(table, outboxRow.rowId);
          pushed += 1;
        } catch (rowError) {
          if (isNetworkError(rowError)) {
            throw rowError;
          }

          await quarantine(table, outboxRow.rowId, rowError);
          quarantined += 1;
        }
      }
    }
  }

  return { ok: true, pushed, quarantined };
}

async function getEntityRow(
  table: SyncTable,
  rowId: string,
): Promise<SyncRow | undefined> {
  switch (table) {
    case "entries":
      return db.entries.get(rowId);
    case "stamps":
      return db.stamps.get(rowId);
    case "placed_stickers":
      return db.placed_stickers.get(rowId);
    case "profiles":
      return db.profiles.get(rowId);
  }
}

async function upsertRows(
  supabase: SupabaseClient,
  table: SyncTable,
  rows: SyncRow[],
): Promise<void> {
  let result;

  try {
    result = await supabase.from(table).upsert(rows);
  } catch (error) {
    throw new PushNetworkError(`Network failure while upserting ${table}.`, {
      cause: error,
    });
  }

  if (result.error) {
    if (result.status === 0) {
      throw new PushNetworkError(`Network failure while upserting ${table}.`, {
        cause: result.error,
      });
    }

    throw result.error;
  }
}

function isNetworkError(error: unknown): error is PushNetworkError {
  return error instanceof PushNetworkError;
}
