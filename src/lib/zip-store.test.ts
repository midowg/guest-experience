import { describe, expect, it } from "vitest";
import { crc32, zipStore } from "./zip-store";

/** Reads a stored zip back: each file's name and bytes, by its central directory, checking each CRC. */
function unzip(zip: Uint8Array): { name: string; bytes: Uint8Array }[] {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const end = zip.byteLength - 22;
  expect(view.getUint32(end, true)).toBe(0x06054b50);
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const files: { name: string; bytes: Uint8Array }[] = [];
  for (let index = 0; index < count; index += 1) {
    expect(view.getUint32(at, true)).toBe(0x02014b50);
    expect(view.getUint16(at + 8, true) & 0x0800).toBe(0x0800);
    const crc = view.getUint32(at + 16, true), size = view.getUint32(at + 24, true), nameLength = view.getUint16(at + 28, true), offset = view.getUint32(at + 42, true);
    const name = new TextDecoder().decode(zip.subarray(at + 46, at + 46 + nameLength));
    expect(view.getUint32(offset, true)).toBe(0x04034b50);
    const start = offset + 30 + view.getUint16(offset + 26, true);
    const bytes = zip.subarray(start, start + size);
    expect(crc32(bytes)).toBe(crc);
    files.push({ name, bytes });
    at += 46 + nameLength;
  }
  return files;
}

describe("zipStore", () => {
  it("computes the zip CRC-32", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array())).toBe(0);
  });

  it("stores files in folders with UTF-8 names, and keeps a repeated name apart", () => {
    const text = (value: string) => new TextEncoder().encode(value);
    const zip = zipStore([
      { name: "REKAP DOKUMENTASI MEETING-NOVEMBER 2026/DOKUMENTASI APPRAISAL/TEAM SM/MoM-2026-11-0012_v1.pdf", bytes: text("%PDF-1.7 isi") },
      { name: "/Foto · Sales & Marketing/01.jpg", bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xe0]) },
      { name: "/Foto · Sales & Marketing/01.jpg", bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xe1]) },
    ]);
    const files = unzip(zip);
    expect(files.map(file => file.name)).toEqual([
      "REKAP DOKUMENTASI MEETING-NOVEMBER 2026/DOKUMENTASI APPRAISAL/TEAM SM/MoM-2026-11-0012_v1.pdf",
      "Foto · Sales & Marketing/01.jpg", "Foto · Sales & Marketing/01 (2).jpg",
    ]);
    expect(new TextDecoder().decode(files[0].bytes)).toBe("%PDF-1.7 isi");
    expect([...files[2].bytes]).toEqual([0xff, 0xd8, 0xff, 0xe1]);
  });

  it("makes an empty archive", () => {
    expect(zipStore([]).byteLength).toBe(22);
  });
});
