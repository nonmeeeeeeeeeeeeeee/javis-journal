// Minimal sync-status observable. Exposed for a future status indicator (M6+);
// unconsumed by UI for now. No external dependency — a tiny pub-sub is enough.

export type SyncStatus = "idle" | "syncing" | "offline" | "error";

let current: SyncStatus = "idle";
const listeners = new Set<(status: SyncStatus) => void>();

export function getSyncStatus(): SyncStatus {
  return current;
}

export function setSyncStatus(next: SyncStatus): void {
  if (next === current) {
    return;
  }

  current = next;

  for (const listener of listeners) {
    listener(next);
  }
}

export function subscribeSyncStatus(
  listener: (status: SyncStatus) => void,
): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}
