// M9 — hand the finished PNG to her. Two EXPLICIT intents, never auto-branching between them
// (the single-button version silently opened the share sheet on any file-sharing device, which
// read as "I asked to download and it shared instead"):
//   • shareBlob   → always the native share sheet (Messages / AirDrop / Save to Photos).
//   • downloadBlob → always a direct `<a download>`, never the share sheet.
// `canShareFiles()` lets the UI show Share only where it actually works.
//
// Touches `navigator`/`document`; no React, no Dexie, no canvas.

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** `javis-journal-2026-07.png` for the viewed month. */
export function exportFilename(year: number, month: number): string {
  return `javis-journal-${year}-${pad2(month)}.png`;
}

type NavWithShare = Navigator & { canShare?: (data: ShareData) => boolean };

function nav(): NavWithShare | undefined {
  return globalThis.navigator as NavWithShare | undefined;
}

function isAbort(err: unknown): boolean {
  return !!err && typeof err === "object" && (err as { name?: string }).name === "AbortError";
}

/**
 * True iff this platform can share FILES (not just text/URLs) — the gate for showing the Share
 * button. Probes `canShare` with a tiny dummy file, since `navigator.share` can exist while file
 * sharing is unsupported (e.g. some desktop browsers).
 */
export function canShareFiles(): boolean {
  const n = nav();
  if (!n?.share || !n.canShare || typeof File === "undefined") return false;
  try {
    const probe = new File([new Blob([""])], "probe.png", { type: "image/png" });
    return n.canShare({ files: [probe] });
  } catch {
    return false;
  }
}

/**
 * Open the native share sheet with the PNG. Resolves `"shared"` once she picks a target, or
 * `"dismissed"` if she backs out (`AbortError`) — the caller keeps the sheet open on a dismissal
 * rather than treating it as done. Any OTHER failure REJECTS (the caller shows an error and points
 * her at Save); we never silently fall back to a download.
 */
export async function shareBlob(
  blob: Blob,
  filename: string,
): Promise<"shared" | "dismissed"> {
  const n = nav();
  if (!n?.share) throw new Error("share unsupported");
  const file = new File([blob], filename, { type: "image/png" });
  try {
    await n.share({ files: [file], title: filename });
    return "shared";
  } catch (err) {
    if (isAbort(err)) return "dismissed";
    throw err;
  }
}

/** Direct download via a synthetic anchor. No share sheet, ever. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
