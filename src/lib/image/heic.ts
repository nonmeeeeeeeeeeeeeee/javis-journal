// HEIC/HEIF detection + transcode. Detection is by ISOBMFF magic bytes only —
// never file extension or MIME (both lie on iOS shares). Tier-1 unit tested.

// ftyp brands that indicate a HEIF/HEIC container. The plan names heic/heix/mif1;
// the rest are the common Apple/HEVC siblings that decode down the same path.
const HEIF_BRANDS = new Set([
  "heic",
  "heix",
  "heim",
  "heis",
  "hevc",
  "hevx",
  "hevm",
  "hevs",
  "mif1",
  "msf1",
]);

/**
 * True if `bytes` is the head of a HEIF/HEIC file. Checks the `ftyp` box at
 * offset 4, its major brand at offset 8, then scans the compatible-brand list.
 */
export function isHeic(bytes: Uint8Array | ArrayBuffer): boolean {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (b.length < 12) return false;
  // bytes[4..8] === "ftyp"
  if (b[4] !== 0x66 || b[5] !== 0x74 || b[6] !== 0x79 || b[7] !== 0x70) {
    return false;
  }
  const major = brandAt(b, 8);
  if (HEIF_BRANDS.has(major)) return true;

  // Scan compatible brands (4 bytes each) up to the declared box size.
  const boxSize = (b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3];
  const end = Math.min(boxSize > 0 ? boxSize : b.length, b.length);
  for (let i = 16; i + 4 <= end; i += 4) {
    if (HEIF_BRANDS.has(brandAt(b, i))) return true;
  }
  return false;
}

function brandAt(b: Uint8Array, offset: number): string {
  return String.fromCharCode(b[offset], b[offset + 1], b[offset + 2], b[offset + 3]);
}

/** Read the first `n` bytes of a blob (for magic-byte sniffing). */
export async function readMagicBytes(file: Blob, n = 32): Promise<Uint8Array> {
  const head = file.slice(0, n);
  return new Uint8Array(await head.arrayBuffer());
}

/**
 * Transcode a HEIC blob to JPEG via heic2any, loaded lazily so its wasm never
 * ships to devices that decode HEIC natively (iOS/Safari). Only called on the
 * non-native-decode path.
 */
export async function heicToJpeg(file: Blob): Promise<Blob> {
  const mod = await import("heic2any");
  const heic2any = (mod.default ?? mod) as (opts: {
    blob: Blob;
    toType?: string;
    quality?: number;
  }) => Promise<Blob | Blob[]>;
  const out = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.92 });
  return Array.isArray(out) ? out[0] : out;
}
