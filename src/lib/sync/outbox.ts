import { db } from "@/lib/db";
import type { SyncOutboxRow } from "@/lib/db/sync-types";

// Contract: any code creating a new entity row must set id: crypto.randomUUID()
// before calling markDirty. The outbox tracks existing entity ids only.
export type SyncTable =
  | "entries"
  | "stamps"
  | "placed_stickers"
  | "profiles";

export type SyncOperation = SyncOutboxRow["op"];

async function findOutboxRow(
  table: SyncTable,
  rowId: string,
): Promise<SyncOutboxRow | undefined> {
  return db.sync_outbox.where("[table+rowId]").equals([table, rowId]).first();
}

export async function markDirty(
  table: SyncTable,
  rowId: string,
  op: SyncOperation,
): Promise<void> {
  const existing = await findOutboxRow(table, rowId);

  await db.sync_outbox.put({
    id: existing?.id ?? crypto.randomUUID(),
    table,
    rowId,
    op,
    attempts: 0,
    quarantined: false,
    lastError: null,
    createdAt: existing?.createdAt ?? Date.now(),
  });
}

export async function clearDirty(
  table: SyncTable,
  rowId: string,
): Promise<void> {
  const existing = await findOutboxRow(table, rowId);

  if (existing) {
    await db.sync_outbox.delete(existing.id);
  }
}

export async function quarantine(
  table: SyncTable,
  rowId: string,
  error: unknown,
): Promise<void> {
  const existing = await findOutboxRow(table, rowId);

  if (!existing) {
    return;
  }

  await db.sync_outbox.put({
    ...existing,
    quarantined: true,
    lastError: formatOutboxError(error),
  });
}

export async function getPending(table: SyncTable): Promise<SyncOutboxRow[]> {
  return db.sync_outbox
    .filter((row) => row.table === table && !row.quarantined)
    .sortBy("createdAt");
}

function formatOutboxError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown sync error";
  }
}
