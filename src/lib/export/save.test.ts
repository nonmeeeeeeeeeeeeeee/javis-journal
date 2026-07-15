import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { exportFilename, saveExport } from "./save";

const PNG = new Blob(["png"], { type: "image/png" });

type AnchorStub = { href: string; download: string; click: () => void; remove: () => void };

function stubDocument() {
  const anchor: AnchorStub = {
    href: "",
    download: "",
    click: vi.fn(),
    remove: vi.fn(),
  };
  vi.stubGlobal("document", {
    createElement: vi.fn(() => anchor),
    body: { appendChild: vi.fn() },
  });
  vi.stubGlobal("URL", {
    createObjectURL: vi.fn(() => "blob:mock"),
    revokeObjectURL: vi.fn(),
  });
  return anchor;
}

beforeEach(() => {
  // Node 20 has a global File; ensure it exists for the share path.
  if (typeof File === "undefined") {
    vi.stubGlobal("File", class {});
  }
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test("filename is javis-journal-YYYY-MM.png with a zero-padded month", () => {
  expect(exportFilename(2026, 7)).toBe("javis-journal-2026-07.png");
  expect(exportFilename(2026, 12)).toBe("javis-journal-2026-12.png");
});

test("shares a file when canShare({files}) is true", async () => {
  const share = vi.fn(async () => undefined);
  vi.stubGlobal("navigator", { share, canShare: () => true });
  const anchor = stubDocument();

  await saveExport(PNG, 2026, 7);

  expect(share).toHaveBeenCalledOnce();
  const arg = share.mock.calls[0][0] as { files: File[]; title: string };
  expect(arg.files).toHaveLength(1);
  expect(arg.title).toBe("javis-journal-2026-07.png");
  expect(anchor.click).not.toHaveBeenCalled(); // no download fallback
});

test("downloads via <a download> when canShare returns false (share exists but can't share files)", async () => {
  const share = vi.fn(async () => undefined);
  vi.stubGlobal("navigator", { share, canShare: () => false });
  const anchor = stubDocument();

  await saveExport(PNG, 2026, 7);

  expect(share).not.toHaveBeenCalled();
  expect(anchor.click).toHaveBeenCalledOnce();
  expect(anchor.download).toBe("javis-journal-2026-07.png");
});

test("downloads when navigator has no share API at all (desktop)", async () => {
  vi.stubGlobal("navigator", {});
  const anchor = stubDocument();

  await saveExport(PNG, 2026, 7);
  expect(anchor.click).toHaveBeenCalledOnce();
});

test("an AbortError (she dismissed the sheet) is swallowed — no download fallback", async () => {
  const share = vi.fn(async () => {
    throw Object.assign(new Error("dismissed"), { name: "AbortError" });
  });
  vi.stubGlobal("navigator", { share, canShare: () => true });
  const anchor = stubDocument();

  await expect(saveExport(PNG, 2026, 7)).resolves.toBeUndefined();
  expect(anchor.click).not.toHaveBeenCalled();
});

test("a non-Abort share error falls back to the download", async () => {
  const share = vi.fn(async () => {
    throw Object.assign(new Error("boom"), { name: "NotAllowedError" });
  });
  vi.stubGlobal("navigator", { share, canShare: () => true });
  const anchor = stubDocument();

  await saveExport(PNG, 2026, 7);
  expect(anchor.click).toHaveBeenCalledOnce();
});
