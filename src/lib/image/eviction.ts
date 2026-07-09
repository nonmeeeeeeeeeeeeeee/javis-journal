// Original-eviction (decision 3): drop the on-device original once its upload is
// durable AND it is older than the retention window. main/thumb are always kept.
// Runs on sync-loop start and after each successful flush.

import { db } from "@/lib/db";

export const ORIGINAL_RETENTION_MS = 72 * 60 * 60 * 1000; // 72h from ingest (createdAt)

/**
 * Null out `original` for eligible blobs. An original is dropped only when it is
 * older than the retention window AND has no live ('images', id) outbox row
 * (pending OR quarantined) — the outbox row is the upload-durability signal, and
 * an un-uploaded original is the only full-quality copy. Returns the count evicted.
 */
export async function evictOriginals(now: number = Date.now()): Promise<number> {
  const cutoff = now - ORIGINAL_RETENTION_MS;
  const candidates = await db.image_blobs.where("createdAt").below(cutoff).toArray();

  let evicted = 0;
  for (const blob of candidates) {
    if (blob.original == null) continue; // already evicted

    // Interlock: any outbox row (pending or quarantined) means the upload is not
    // yet confirmed durable — keep the original.
    const outboxRow = await db.sync_outbox
      .where("[table+rowId]")
      .equals(["images", blob.id])
      .first();
    if (outboxRow) continue;

    await db.image_blobs.update(blob.id, { original: null });
    evicted += 1;
  }

  return evicted;
}
