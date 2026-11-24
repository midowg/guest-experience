import { describe, expect, it } from "vitest";
import { mainWamApi } from "@/lib/routes";
import { moveCell, tapCell } from "./mosaic-pick";
import { sampleFeedSemua, sampleGalleryAll, sampleGalleryMine, sampleMosaic } from "./sample";
import { demoPicture, demoTileDetail, DEMO_PICTURES, isDemoFile, viewerFile } from "./viewer";

/* The photo viewer's pure parts: which file it shows and saves, the sample's details, and choosing a cell from a tap or the arrows. */

describe("the sample pictures and the viewer's files", () => {
  it("cycle through the 24 local pictures, never a negative or missing one", () => {
    expect(DEMO_PICTURES).toBe(24);
    expect(demoPicture(0)).toBe("/wam/demo/foto-01.svg");
    expect(demoPicture(23)).toBe("/wam/demo/foto-24.svg");
    expect(demoPicture(24)).toBe("/wam/demo/foto-01.svg");
    expect(demoPicture(-1)).toBe("/wam/demo/foto-24.svg");
    expect(isDemoFile(demoPicture(7))).toBe(true);
    expect(isDemoFile("https://r2.example/x.jpg")).toBe(false);
    expect(isDemoFile(null)).toBe(false);
  });

  it("show and save a real photo through the file route (?unduh=1 for saving) under a plain .jpg name", () => {
    const id = "33333333-3333-4333-8333-333333333333";
    expect(viewerFile(id)).toEqual({ view: mainWamApi.photoFile(id, "besar"), download: mainWamApi.photoDownload(id), name: "wam-2026-33333333.jpg" });
    expect(mainWamApi.photoDownload(id)).toBe(`/api/wam/acara/momen/${id}/berkas?ukuran=besar&unduh=1`);
    // A storage address that came with the list is never what is saved: the route checks access again.
    expect(viewerFile(id, "https://r2.example/x.jpg").download).toBe(mainWamApi.photoDownload(id));
  });

  it("show and save a sample photo from its local file as .svg", () => {
    expect(viewerFile("00000000-0000-4000-8800-000000000012", demoPicture(3))).toEqual({ view: "/wam/demo/foto-04.svg", download: "/wam/demo/foto-04.svg", name: "wam-2026-00000000.svg" });
  });

  it("give every sample photo of the previews a picture (stack, gallery, Fotoku), and the Mozaik's tiles too", () => {
    for (const photo of [...sampleFeedSemua, ...sampleGalleryAll, ...sampleGalleryMine]) { expect(isDemoFile(photo.src.kecil)).toBe(true); expect(isDemoFile(photo.src.besar)).toBe(true); }
    const manifest = sampleMosaic();
    expect(manifest.tiles.every(tile => isDemoFile(tile.src))).toBe(true);
    expect(new Set(manifest.tiles.map(tile => tile.src)).size).toBe(24);
  });

  it("tell a sample tile's details: a made-up name from the sample people, the viewer's own as mine", () => {
    const [first, second] = sampleMosaic().tiles;
    const other = demoTileDetail({ ...first, mine: false }, "Rani");
    expect(other.owner.name).toMatch(/\S/);
    expect(other).toMatchObject({ id: first.id, mine: false });
    expect(Date.parse(other.takenAt)).not.toBeNaN();
    expect(demoTileDetail({ ...second, mine: true }, "Rani")).toMatchObject({ mine: true, owner: { name: "Rani" } });
  });
});

describe("choosing a cell", () => {
  // A 10 × 4 grid, 10 px cells, a 1 px gap, drawn from (2, 2); photos in a few cells.
  const grid = { left: 2, top: 2, cell: 10, gap: 1 };
  const photos = [11, 12, 25, 33];
  const centreOf = (cell: number) => ({ x: grid.left + (cell % 10) * 11 + 5, y: grid.top + Math.floor(cell / 10) * 11 + 5 });

  it("a tap on a cell with a photo picks it; on an empty cell, the gap or outside, a mouse picks nothing", () => {
    expect(tapCell(centreOf(12), grid, 10, 4, photos, false)).toBe(12);
    expect(tapCell(centreOf(13), grid, 10, 4, photos, false)).toBeNull();
    expect(tapCell({ x: grid.left + 2 * 11 + 10.5, y: centreOf(12).y }, grid, 10, 4, photos, false)).toBeNull();
    expect(tapCell({ x: 0, y: 0 }, grid, 10, 4, photos, false)).toBeNull();
    expect(tapCell({ x: 500, y: 500 }, grid, 10, 4, photos, true)).toBeNull();
  });

  it("a finger also takes the nearest photo within a cell and a half, never one further away", () => {
    expect(tapCell({ x: centreOf(12).x + 9, y: centreOf(12).y }, grid, 10, 4, photos, true)).toBe(12);
    expect(tapCell(centreOf(18), grid, 10, 4, photos, true)).toBeNull();
    expect(tapCell(centreOf(22), grid, 10, 4, photos, true)).toBe(12);
  });

  it("the arrow keys move to the nearest photo in that direction, and stay put when there is none", () => {
    expect(moveCell(11, [1, 0], 10, photos)).toBe(12);
    expect(moveCell(12, [-1, 0], 10, photos)).toBe(11);
    expect(moveCell(12, [0, 1], 10, photos)).toBe(33);
    expect(moveCell(25, [-1, 0], 10, photos)).toBe(33);
    expect(moveCell(25, [0, -1], 10, photos)).toBe(12);
    expect(moveCell(25, [1, 0], 10, photos)).toBeNull();
    expect(moveCell(11, [0, -1], 10, photos)).toBeNull();
  });
});
