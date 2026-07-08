import { db } from "@/lib/db";
import type {
  Entry,
  ImageRow,
  PlacedSticker,
  Profile,
  Stamp,
  StickerAsset,
} from "@/lib/db/types";
import { createClient } from "@/lib/supabase/browser";

type LWWTable = "entries" | "stamps" | "placed_stickers" | "profiles";
type AppendOnlyTable = "images";
type TrayTable = "sticker_assets";

type LWWRowByTable = {
  entries: Entry;
  stamps: Stamp;
  placed_stickers: PlacedSticker;
  profiles: Profile;
};

type AppendOnlyRowByTable = {
  images: ImageRow;
};

type TombstoneableRow = {
  deleted_at?: string | null;
};

async function currentUserId(): Promise<string> {
  const supabase = createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    throw error;
  }

  if (!user) {
    throw new Error("Cannot pull sync rows without a signed-in user.");
  }

  return user.id;
}

function lwwPrimaryKey<TTable extends LWWTable>(
  table: TTable,
  row: LWWRowByTable[TTable],
): string {
  return table === "profiles"
    ? (row as Profile).user_id
    : (row as LWWRowByTable[Exclude<LWWTable, "profiles">]).id;
}

function lwwTieKey<TTable extends LWWTable>(
  table: TTable,
  row: LWWRowByTable[TTable],
): string {
  return lwwPrimaryKey(table, row);
}

async function getLocalLWW<TTable extends LWWTable>(
  table: TTable,
  rowId: string,
): Promise<LWWRowByTable[TTable] | undefined> {
  switch (table) {
    case "entries":
      return db.entries.get(rowId) as Promise<LWWRowByTable[TTable] | undefined>;
    case "stamps":
      return db.stamps.get(rowId) as Promise<LWWRowByTable[TTable] | undefined>;
    case "placed_stickers":
      return db.placed_stickers.get(rowId) as Promise<
        LWWRowByTable[TTable] | undefined
      >;
    case "profiles":
      return db.profiles.get(rowId) as Promise<LWWRowByTable[TTable] | undefined>;
  }
}

async function putLocalLWW<TTable extends LWWTable>(
  table: TTable,
  row: LWWRowByTable[TTable],
): Promise<void> {
  switch (table) {
    case "entries":
      await db.entries.put(row as Entry);
      return;
    case "stamps":
      await db.stamps.put(row as Stamp);
      return;
    case "placed_stickers":
      await db.placed_stickers.put(row as PlacedSticker);
      return;
    case "profiles":
      await db.profiles.put(row as Profile);
      return;
  }
}

async function deleteLocalLWW(
  table: LWWTable,
  rowId: string,
): Promise<void> {
  switch (table) {
    case "entries":
      await db.entries.delete(rowId);
      return;
    case "stamps":
      await db.stamps.delete(rowId);
      return;
    case "placed_stickers":
      await db.placed_stickers.delete(rowId);
      return;
    case "profiles":
      await db.profiles.delete(rowId);
      return;
  }
}

async function isLocallyDirty(table: string, rowId: string): Promise<boolean> {
  const dirtyRow = await db.sync_outbox
    .where("[table+rowId]")
    .equals([table, rowId])
    .first();

  return dirtyRow !== undefined;
}

function remoteWins<TTable extends LWWTable>(
  table: TTable,
  remote: LWWRowByTable[TTable],
  local: LWWRowByTable[TTable],
): boolean {
  if (remote.updated_at > local.updated_at) {
    return true;
  }

  if (remote.updated_at < local.updated_at) {
    return false;
  }

  return lwwTieKey(table, remote) > lwwTieKey(table, local);
}

function maxTimestamp(current: string | null, next: string): string {
  return current === null || next > current ? next : current;
}

export async function pullLWW<TTable extends LWWTable>(
  table: TTable,
): Promise<void> {
  const supabase = createClient();
  const userId = await currentUserId();
  const cursor = (await db.sync_meta.get(table))?.cursor ?? null;

  let query = supabase.from(table).select().eq("user_id", userId);

  if (cursor) {
    query = query.gt("updated_at", cursor);
  }

  const { data, error } = await query.order("updated_at", {
    ascending: true,
  });

  if (error) {
    throw error;
  }

  const rows = (data ?? []) as LWWRowByTable[TTable][];
  let nextCursor = cursor;

  for (const remote of rows) {
    nextCursor = maxTimestamp(nextCursor, remote.updated_at);

    const rowId = lwwPrimaryKey(table, remote);
    const local = await getLocalLWW(table, rowId);
    const remoteDeleted =
      (remote as TombstoneableRow).deleted_at !== null &&
      (remote as TombstoneableRow).deleted_at !== undefined;

    if (!local) {
      if (!remoteDeleted) {
        await putLocalLWW(table, remote);
      }

      continue;
    }

    const locallyDirty = await isLocallyDirty(table, rowId);

    if (locallyDirty && local.updated_at > remote.updated_at) {
      continue;
    }

    if (!remoteWins(table, remote, local)) {
      continue;
    }

    if (remoteDeleted) {
      await deleteLocalLWW(table, rowId);
    } else {
      await putLocalLWW(table, remote);
    }
  }

  if (nextCursor !== cursor) {
    await db.sync_meta.put({ table, cursor: nextCursor });
  }
}

export async function pullAppendOnly<TTable extends AppendOnlyTable>(
  table: TTable,
  cursorColumn: keyof AppendOnlyRowByTable[TTable] & string,
): Promise<void> {
  const supabase = createClient();
  const userId = await currentUserId();
  const cursor = (await db.sync_meta.get(table))?.cursor ?? null;

  let query = supabase.from(table).select().eq("user_id", userId);

  if (cursor) {
    query = query.gt(cursorColumn, cursor);
  }

  const { data, error } = await query.order(cursorColumn, {
    ascending: true,
  });

  if (error) {
    throw error;
  }

  const rows = (data ?? []) as AppendOnlyRowByTable[TTable][];
  let nextCursor = cursor;

  for (const remote of rows) {
    nextCursor = maxTimestamp(nextCursor, String(remote[cursorColumn]));

    const local = await db.images.get(remote.id);

    if (!local) {
      await db.images.put(remote);
    }
  }

  if (nextCursor !== cursor) {
    await db.sync_meta.put({ table, cursor: nextCursor });
  }
}

async function pullStickerAssets(table: TrayTable = "sticker_assets"): Promise<void> {
  const supabase = createClient();
  const userId = await currentUserId();
  const { data, error } = await supabase
    .from(table)
    .select()
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }

  const rows = (data ?? []) as StickerAsset[];

  for (const remote of rows) {
    const local = await db.sticker_assets.get(remote.id);

    if (!local) {
      await db.sticker_assets.put(remote);
    }
  }
}

export async function pullAll(): Promise<void> {
  await Promise.all([
    pullLWW("entries"),
    pullLWW("stamps"),
    pullLWW("placed_stickers"),
    pullLWW("profiles"),
    pullAppendOnly("images", "created_at"),
    pullStickerAssets(),
  ]);
}
