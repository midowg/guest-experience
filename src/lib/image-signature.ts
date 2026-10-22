export type PhotoKind = "jpeg" | "png" | "webp" | "heic";
export const photoMime: Record<PhotoKind, string> = { jpeg: "image/jpeg", png: "image/png", webp: "image/webp", heic: "image/heic" };
export const photoExtension: Record<PhotoKind, string> = { jpeg: "jpg", png: "png", webp: "webp", heic: "heic" };

/** The file type from its first bytes, ignoring whatever name or type the browser claimed. */
export function sniffPhoto(bytes: Uint8Array): PhotoKind | null {
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.slice(start, end));
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => bytes[i] === b)) return "png";
  if (bytes.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "webp";
  if (bytes.length >= 12 && ascii(4, 8) === "ftyp" && ["heic", "heix", "hevc", "mif1", "msf1"].includes(ascii(8, 12))) return "heic";
  return null;
}

export function kindFromMime(mime: string): PhotoKind | null {
  const found = (Object.entries(photoMime) as [PhotoKind, string][]).find(([, value]) => value === mime.toLowerCase());
  return found ? found[0] : mime.toLowerCase() === "image/heif" ? "heic" : null;
}
