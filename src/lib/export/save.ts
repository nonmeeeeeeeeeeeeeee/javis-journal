// M9 — hand the finished PNG to her: the native share sheet where it exists (her iPhone → Save
// to Photos / Messages / AirDrop, i.e. "keep or share"), an `<a download>` everywhere else
// (M9-PLAN decision 5).
//
// The branch is on `navigator.canShare({ files })`, NOT `navigator.share` alone — some browsers
// expose `share` (text/URL) but cannot share FILES, and calling it would throw. If she DISMISSES
// the share sheet the rejection is an `AbortError` and is swallowed silently (not an error). Any
// OTHER share failure falls through to the anchor download so she still gets the file.
//
// Touches `navigator`/`document`; no React, no Dexie, no canvas.

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** `javis-journal-2026-07.png` for the viewed month. */
export function exportFilename(year: number, month: number): string {
  return `javis-journal-${year}-${pad2(month)}.png`;
}

function isAbort(err: unknown): boolean {
  return !!err && typeof err === "object" && (err as { name?: string }).name === "AbortError";
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Save/share the PNG for the viewed month. Resolves once the file has been handed off (or the
 * share sheet dismissed); never rejects on an `AbortError`.
 */
export async function saveExport(blob: Blob, year: number, month: number): Promise<void> {
  const filename = exportFilename(year, month);
  const nav = globalThis.navigator as
    | (Navigator & { canShare?: (data: ShareData) => boolean })
    | undefined;

  if (nav?.share && nav.canShare) {
    const file = new File([blob], filename, { type: "image/png" });
    if (nav.canShare({ files: [file] })) {
      try {
        await nav.share({ files: [file], title: filename });
        return;
      } catch (err) {
        if (isAbort(err)) return; // she dismissed the sheet — a no-op, not a failure
        // any non-Abort share error → fall through to the download so she still gets the file
      }
    }
  }

  downloadBlob(blob, filename);
}
