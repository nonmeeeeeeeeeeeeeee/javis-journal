"use client";

import { useEffect } from "react";

import { startSyncLoop } from "@/lib/sync/engine";

/**
 * Mounts the local-first sync loop for a signed-in session. Renders nothing.
 * The engine resolves the current user fresh each cycle, so this can mount
 * unconditionally in the root layout — it no-ops (offline/backoff) when signed out.
 */
export default function SyncBoot() {
  useEffect(() => {
    const stop = startSyncLoop();
    return stop;
  }, []);

  return null;
}
