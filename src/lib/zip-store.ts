/*
 * A small zip writer (12 Nov 2026, Arsip MoM): files stored as they are, without compression,
 * since PDFs and JPEGs are compressed already. It runs in the browser, so a large export (every
 * MoM of a month with its photos) is put together on the admin's computer instead of in one server
 * answer, which Vercel caps at a few megabytes. Names are UTF-8 and may hold folders ("a/b/c.pdf").
 * No zip64: one archive stays under 4 GB, far above what Arsip MoM lets one export hold.
 */

export type ZipFile = { name: string; bytes: Uint8Array; date?: Date };

const TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let index = 0; index < bytes.length; index += 1) c = TABLE[(c ^ bytes[index]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** The time and date as a zip stores them (local time, two-second steps, from 1980). */
function dos(date: Date): { time: number; day: number } {
  const year = Math.max(1980, date.getFullYear());
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    day: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

/** The files as one .zip; a name that repeats gets " (2)" before its extension. */
export function zipStore(files: readonly ZipFile[]): Uint8Array<ArrayBuffer> {
  const encoder = new TextEncoder();
  const used = new Set<string>();
  const unique = (name: string) => {
    let candidate = name;
    for (let n = 2; used.has(candidate.toLowerCase()); n += 1) candidate = name.replace(/(\.[^./]+)?$/, ext => ` (${n})${ext}`);
    used.add(candidate.toLowerCase());
    return candidate;
  };
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const file of files) {
    const name = encoder.encode(unique(file.name.replace(/\\/g, "/").replace(/^\/+/, "")));
    const crc = crc32(file.bytes);
    const { time, day } = dos(file.date ?? new Date());
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(6, 0x0800, true); local.setUint16(8, 0, true);
    local.setUint16(10, time, true); local.setUint16(12, day, true); local.setUint32(14, crc, true);
    local.setUint32(18, file.bytes.length, true); local.setUint32(22, file.bytes.length, true); local.setUint16(26, name.length, true); local.setUint16(28, 0, true);
    parts.push(new Uint8Array(local.buffer), name, file.bytes);
    const entry = new DataView(new ArrayBuffer(46));
    entry.setUint32(0, 0x02014b50, true); entry.setUint16(4, 20, true); entry.setUint16(6, 20, true); entry.setUint16(8, 0x0800, true); entry.setUint16(10, 0, true);
    entry.setUint16(12, time, true); entry.setUint16(14, day, true); entry.setUint32(16, crc, true);
    entry.setUint32(20, file.bytes.length, true); entry.setUint32(24, file.bytes.length, true); entry.setUint16(28, name.length, true);
    entry.setUint32(42, offset, true);
    central.push(new Uint8Array(entry.buffer), name);
    offset += 30 + name.length + file.bytes.length;
  }
  const centralSize = central.reduce((sum, part) => sum + part.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, centralSize, true); end.setUint32(16, offset, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of all) { out.set(part, at); at += part.length; }
  return out;
}
