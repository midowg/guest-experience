/**
 * The pure pieces of scripts/wellbeing-storage.mjs (18 Nov 2026), tested in tests/scripts/wellbeing-storage.test.ts:
 * what kind of photo a file is, where an old photo goes in Journey's storage, and an activity's photos after the move.
 */
import crypto from "node:crypto";

/**
 * Proof kinds by their first bytes (as src/lib/image-signature.ts, plus GIF and the short videos the old
 * app took as proof: MP4 and MOV, shown with a player in Journey).
 */
export const KINDS = {
  jpeg: { ext: "jpg", mime: "image/jpeg" },
  png: { ext: "png", mime: "image/png" },
  webp: { ext: "webp", mime: "image/webp" },
  heic: { ext: "heic", mime: "image/heic" },
  gif: { ext: "gif", mime: "image/gif" },
  mp4: { ext: "mp4", mime: "video/mp4" },
  mov: { ext: "mov", mime: "video/quicktime" },
};

export function sniffKind(bytes) {
  const ascii = (start, end) => String.fromCharCode(...bytes.slice(start, end));
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => bytes[i] === b)) return "png";
  if (bytes.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "webp";
  if (bytes.length >= 6 && (ascii(0, 6) === "GIF87a" || ascii(0, 6) === "GIF89a")) return "gif";
  if (bytes.length >= 12 && ascii(4, 8) === "ftyp") {
    const brand = ascii(8, 12);
    if (["heic", "heix", "hevc", "mif1", "msf1"].includes(brand)) return "heic";
    if (brand === "qt  ") return "mov";
    return "mp4"; // isom, mp41, mp42, avc1, M4V, 3gp…: an MP4-family video
  }
  return null;
}

/** A photo still in the old app's storage is a link; one in Journey's storage is a key (wellbeing/...). */
export const isLink = value => /^https?:\/\//i.test(value);

/**
 * Where an old photo goes in Journey's storage: wellbeing/<employee>/<id>.<ext>, the id fixed by the link,
 * so a second run finds the same key (and skips it). Under wellbeing/, so the app signs it like any proof photo.
 */
export function photoKey(employeeId, url, ext) {
  const h = crypto.createHash("sha1").update(`wellbeing-foto:${url}`).digest("hex");
  return `wellbeing/${employeeId}/${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}.${ext}`;
}

/** Where any old storage object is kept for the archive: outside wellbeing/, so the app never shows it. */
export const archiveKey = (bucket, objectPath) => `arsip/wellbeing-lama/${bucket}/${objectPath.replace(/^\/+/, "")}`;

/** An activity's photos with every moved link replaced by its key; `left` counts the links not moved yet. */
export function movePhotos(photos, moved) {
  const next = photos.map(photo => isLink(photo) ? moved.get(photo) ?? photo : photo);
  return { photos: next, changed: next.some((photo, index) => photo !== photos[index]), left: next.filter(isLink).length };
}

/** A CSV with a header row; every field quoted (links may hold commas). */
export function csvText(columns, rows) {
  const cell = value => `"${String(value ?? "").replace(/"/g, '""')}"`;
  return `${[columns.map(cell).join(","), ...rows.map(row => columns.map(column => cell(row[column])).join(","))].join("\n")}\n`;
}

/** "1,5 MB" for a report. */
export const megabytes = bytes => `${(bytes / 1048576).toLocaleString("id-ID", { maximumFractionDigits: 1 })} MB`;
