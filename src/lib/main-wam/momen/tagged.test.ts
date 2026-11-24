import { describe, expect, it } from "vitest";
import { decodeTaggedCursor, encodeTaggedCursor, taggedPage, togetherNames, visibleTagged, type TaggedPhotoRow } from "./tagged";

/* Galeri, tab Ditandai: what a person may see of the photos that tag them, and the pages (30, newest first). */

const ME = "11111111-1111-4111-8111-111111111111";
const GROUP = "99999999-9999-4999-8999-999999999999";
const NOW = new Date("2027-01-05T08:00:00Z");
const viewer: Parameters<typeof visibleTagged>[0] = { id: ME, roles: [], group: { id: GROUP, name: "Kelompok 3", number: 3, coordinator: false, size: 8 } };
const uid = (n: number) => `00000000-0000-4000-8c00-${String(n).padStart(12, "0")}`;
function row(n: number, over: Partial<TaggedPhotoRow> = {}): TaggedPhotoRow {
  return { id: uid(n), owner_id: "22222222-2222-4222-8222-222222222222", audience: "semua", group_id: null, session_id: null, width: 1280, height: 1600,
    taken_at: "2027-01-05T07:00:00Z", visible_at: new Date(NOW.getTime() - n * 60_000).toISOString(), status: "tampil", file_key: `main-wam/momen/${uid(n)}.jpg`, thumb_key: null, ...over };
}

describe("visibleTagged: the same access rules as the feed", () => {
  it("keeps shown photos of others for everyone, newest first", () => {
    const rows = [row(3), row(1), row(2)];
    expect(visibleTagged(viewer, rows, new Set(), NOW).map(item => item.id)).toEqual([uid(1), uid(2), uid(3)]);
  });

  it("leaves out hidden or in-review photos, and photos still within their 5 seconds", () => {
    const rows = [row(1, { status: "disembunyikan" }), row(2, { status: "ditinjau" }), row(3, { visible_at: new Date(NOW.getTime() + 5_000).toISOString() }), row(4)];
    expect(visibleTagged(viewer, rows, new Set(), NOW).map(item => item.id)).toEqual([uid(4)]);
  });

  it("never lists the person's own photos (those are Fotoku)", () => {
    expect(visibleTagged(viewer, [row(1, { owner_id: ME }), row(2)], new Set(), NOW).map(item => item.id)).toEqual([uid(2)]);
  });

  it("leaves out a photo the person reported (until Tampilkan lagi)", () => {
    expect(visibleTagged(viewer, [row(1), row(2)], new Set([uid(1)]), NOW).map(item => item.id)).toEqual([uid(2)]);
  });

  it("a kelompok photo only for its own kelompok", () => {
    const mine = row(1, { audience: "kelompok", group_id: GROUP });
    const other = row(2, { audience: "kelompok", group_id: "88888888-8888-4888-8888-888888888888" });
    expect(visibleTagged(viewer, [mine, other], new Set(), NOW).map(item => item.id)).toEqual([uid(1)]);
    expect(visibleTagged({ ...viewer, group: null }, [mine, other], new Set(), NOW)).toEqual([]);
  });
});

describe("pages and cursor", () => {
  const sorted = visibleTagged(viewer, Array.from({ length: 70 }, (_, index) => row(index + 1)), new Set(), NOW);

  it("pages of 30 newest first, each ending in the cursor of the next, the last with none", () => {
    const first = taggedPage(sorted, null);
    expect(first.rows).toHaveLength(30);
    expect(first.rows[0].id).toBe(uid(1));
    expect(first.next).toBe(encodeTaggedCursor(first.rows[29]));
    const second = taggedPage(sorted, decodeTaggedCursor(first.next) as never);
    expect(second.rows.map(item => item.id)).toEqual(sorted.slice(30, 60).map(item => item.id));
    const third = taggedPage(sorted, decodeTaggedCursor(second.next) as never);
    expect(third.rows).toHaveLength(10);
    expect(third.next).toBeNull();
  });

  it("30 or fewer: one page and no cursor ('Muat lagi' does not show)", () => {
    expect(taggedPage(sorted.slice(0, 30), null).next).toBeNull();
    expect(taggedPage([], null)).toEqual({ rows: [], next: null });
  });

  it("a cursor round-trips, and a cursor that is not ours is refused", () => {
    const text = encodeTaggedCursor(row(5));
    expect(decodeTaggedCursor(text)).toEqual({ at: row(5).visible_at, id: uid(5) });
    expect(decodeTaggedCursor(null)).toBeNull();
    expect(decodeTaggedCursor("")).toBeNull();
    for (const bad of ["b~", "t~", "t~x~y", `t~nope~${uid(1)}`, `s~${row(1).visible_at}~${uid(1)}`, "t".repeat(200)]) expect(decodeTaggedCursor(bad), bad).toBe(false);
  });
});

it("names who is on the photo with the viewer first", () => {
  expect(togetherNames("kamu", ["Sari", "Dimas"])).toBe("kamu, Sari, Dimas");
  expect(togetherNames("you", [])).toBe("you");
});
