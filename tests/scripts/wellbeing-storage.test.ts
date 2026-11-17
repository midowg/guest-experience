import { describe, expect, it } from "vitest";
import { archiveKey, csvText, isLink, movePhotos, photoKey, sniffKind } from "../../scripts/wellbeing-storage-lib.mjs";

/* Moving the old Wellbeing app's storage into Journey (scripts/wellbeing-storage.mjs, 18 Nov 2026). */

const bytes = (...values: number[]) => new Uint8Array(values);
const ascii = (text: string) => new Uint8Array([...text].map(char => char.charCodeAt(0)));
const OLD = "https://abc.supabase.co/storage/v1/object/public/quest-proofs/activity-proofs/2026-06-05/1779453072431-0.jpg";
const EMPLOYEE = "11111111-2222-4333-8444-555555555555";

describe("wellbeing storage move", () => {
  it("tells the photo kind from the first bytes, not the name", () => {
    expect(sniffKind(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("jpeg");
    expect(sniffKind(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe("png");
    expect(sniffKind(ascii("RIFF\0\0\0\0WEBPVP8 "))).toBe("webp");
    expect(sniffKind(ascii("\0\0\0\x18ftypheic"))).toBe("heic");
    expect(sniffKind(ascii("GIF89a"))).toBe("gif");
    // Short videos the old app took as proof.
    expect(sniffKind(ascii("\0\0\0\x20ftypisom"))).toBe("mp4");
    expect(sniffKind(ascii("\0\0\0\x14ftypqt  "))).toBe("mov");
    expect(sniffKind(ascii("%PDF-1.7"))).toBeNull();
    expect(sniffKind(ascii("<html>"))).toBeNull();
  });

  it("gives an old photo one fixed key under wellbeing/<employee>/, so a second run skips it", () => {
    const key = photoKey(EMPLOYEE, OLD, "jpg");
    expect(key).toMatch(new RegExp(`^wellbeing/${EMPLOYEE}/[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}\\.jpg$`));
    expect(photoKey(EMPLOYEE, OLD, "jpg")).toBe(key);
    expect(photoKey(EMPLOYEE, OLD.replace("-0.jpg", "-1.jpg"), "jpg")).not.toBe(key);
    // The archive is outside wellbeing/: never signed or shown by the app.
    expect(archiveKey("quest-proofs", "/activity-proofs/a.jpg")).toBe("arsip/wellbeing-lama/quest-proofs/activity-proofs/a.jpg");
  });

  it("replaces only moved links in an activity's photos, and counts what is left", () => {
    const key = photoKey(EMPLOYEE, OLD, "jpg");
    const second = OLD.replace("-0.jpg", "-1.jpg");
    const own = `wellbeing/${EMPLOYEE}/0b9f3f0e-1c2d-4e5f-8a9b-0c1d2e3f4a5b.webp`;
    expect(movePhotos([OLD, own], new Map([[OLD, key]]))).toEqual({ photos: [key, own], changed: true, left: 0 });
    expect(movePhotos([OLD, second], new Map([[OLD, key]]))).toEqual({ photos: [key, second], changed: true, left: 1 });
    expect(movePhotos([own], new Map())).toEqual({ photos: [own], changed: false, left: 0 });
    expect(isLink(OLD)).toBe(true);
    expect(isLink(own)).toBe(false);
  });

  it("writes the list as CSV with every field quoted (links may hold commas)", () => {
    expect(csvText(["url", "bytes"], [{ url: 'https://x/a,b"c.jpg', bytes: 12 }])).toBe('"url","bytes"\n"https://x/a,b""c.jpg","12"\n');
  });
});
