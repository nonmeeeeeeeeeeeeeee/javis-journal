import { db } from "@/lib/db";
import type { ImageBlobRow } from "@/lib/db/image-types";
import type {
  Entry,
  ImageRow,
  PlacedSticker,
  Profile,
  Stamp,
  StickerAsset,
} from "@/lib/db/types";
import { createClient } from "@/lib/supabase/browser";
import { mainPath, stampMainPath, stampThumbPath, thumbPath } from "@/lib/image/storage-paths";
import {
  clearDirty,
  getPending,
  quarantine,
  type SyncTable,
} from "./outbox";

export { clearDirty, getPending, markDirty, quarantine } from "./outbox";

type SyncRow = Entry | Stamp | PlacedSticker | StickerAsset | Profile;
type SupabaseClient = ReturnType<typeof createClient>;

// Order matters: `sticker_assets` flushes BEFORE `placed_stickers`, because a placed sticker's
// `sticker_asset_id` FK can only resolve on the server once its tray row has landed. (Images
// already flush before all of these, for the same reason.)
const LWW_TABLES: SyncTable[] = [
  "entries",
  "stamps",
  "sticker_assets",
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

  // Images branch runs BEFORE the LWW tables (decision 9): a stamps.image_id FK can
  // only resolve on the server after the image row + blobs have landed.
  const imageResult = await flushImages(supabase, user.id);
  pushed += imageResult.pushed;
  quarantined += imageResult.quarantined;

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

async function flushImages(
  supabase: SupabaseClient,
  uid: string,
): Promise<{ pushed: number; quarantined: number }> {
  const pending = await getPending("images");
  let pushed = 0;
  let quarantined = 0;

  for (const outboxRow of pending) {
    const id = outboxRow.rowId;
    const [imageRow, blobRow] = await Promise.all([
      db.images.get(id),
      db.image_blobs.get(id),
    ]);

    // An 'upload' outbox row only exists on the ingesting device, where main+thumb
    // are always present; a missing row/blob is a genuine poison pill.
    if (!imageRow || !blobRow || !blobRow.main || !blobRow.thumb) {
      await quarantine("images", id, "Local image row or blobs are missing.");
      quarantined += 1;
      continue;
    }

    try {
      await uploadImage(supabase, uid, imageRow, blobRow.main, blobRow.thumb, blobRow.kind);
      await clearDirty("images", id);
      pushed += 1;
    } catch (error) {
      if (isNetworkError(error)) {
        throw error;
      }
      await quarantine("images", id, error);
      quarantined += 1;
    }
  }

  return { pushed, quarantined };
}

// Every step is idempotent (deterministic paths + upsert-on-id), so a retry that
// re-runs all steps after a partial failure is always safe.
async function uploadImage(
  supabase: SupabaseClient,
  uid: string,
  imageRow: ImageRow,
  mainBlob: Blob,
  thumbBlob: Blob,
  kind: ImageBlobRow["kind"],
): Promise<void> {
  // A baked stamp (ADR-M5) uploads WebP/PNG-alpha for BOTH closeup and thumb, so its thumb
  // extension + content-type track the bake mime. A **sticker**'s thumb is PNG for the same
  // reason: it has alpha, and a JPEG thumb would render its transparent pixels black in the
  // sticker layer (which draws from thumbs). Only a photo's thumb is JPEG.
  let main: string;
  let thumb: string;
  let thumbType: string;
  if (kind === "stamp") {
    main = stampMainPath(uid, imageRow.id, imageRow.mime);
    thumb = stampThumbPath(uid, imageRow.id, imageRow.mime);
    thumbType = imageRow.mime;
  } else {
    main = mainPath(uid, imageRow.id, kind);
    thumb = thumbPath(uid, imageRow.id, kind);
    thumbType = kind === "sticker" ? "image/png" : "image/jpeg";
  }

  await uploadObject(supabase, main, mainBlob, imageRow.mime);
  await uploadObject(supabase, thumb, thumbBlob, thumbType);

  const row: ImageRow = {
    ...imageRow,
    user_id: uid,
    storage_path: main,
    thumb_path: thumb,
  };

  let result;
  try {
    result = await supabase.from("images").upsert(row);
  } catch (error) {
    throw new PushNetworkError("Network failure while upserting images.", {
      cause: error,
    });
  }

  if (result.error) {
    if (result.status === 0) {
      throw new PushNetworkError("Network failure while upserting images.", {
        cause: result.error,
      });
    }
    throw result.error;
  }
}

async function uploadObject(
  supabase: SupabaseClient,
  path: string,
  blob: Blob,
  contentType: string,
): Promise<void> {
  let result;
  try {
    result = await supabase.storage
      .from("images")
      .upload(path, blob, { upsert: true, contentType });
  } catch (error) {
    throw new PushNetworkError(`Network failure while uploading ${path}.`, {
      cause: error,
    });
  }

  if (result.error) {
    // A returned StorageError is a real (non-network) failure -> quarantine this
    // one image. Network failures throw from fetch and are caught above.
    throw result.error;
  }
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
    case "sticker_assets":
      return db.sticker_assets.get(rowId);
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
