import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { UMUM } from "@/lib/main-wam/momen/types";
import { SAMPLE_MOSAIC_GRID } from "@/lib/main-wam/momen/sample";
import { cellOrder, letterCells } from "@/lib/main-wam/momen/mosaic";
import type { MainWamContext } from "./gate";

/* Mode demo's Momen: the gallery has 24 photos with pictures (local files), made-up names, sessions and reactions; the Mozaik's tiles show them too. */

vi.mock("./demo", () => ({ demoOn: async () => true }));
const { demoFeed, demoMosaic, demoSessionCounts, DEMO_PHOTOS } = await import("./demo-momen");

const context = { viewer: { id: "11111111-1111-4111-8111-111111111111", name: "Rani", photo: null, roles: [], group: null }, settings: {} } as unknown as MainWamContext;
const root = join(__dirname, "..", "..", "..", "..", "public");
const fileOf = (address: string) => join(root, address);

describe("Mode demo's gallery", () => {
  it("has at least 24 photos in Semua, each with a local picture that exists and is small, a made-up name, a session (or Umum) and reactions", async () => {
    const page = await demoFeed(context, { view: "semua", session: null, limit: 100 });
    expect(DEMO_PHOTOS).toBeGreaterThanOrEqual(24);
    expect(page!.items).toHaveLength(DEMO_PHOTOS);
    expect(new Set(page!.items.map(photo => photo.id)).size).toBe(DEMO_PHOTOS);
    for (const photo of page!.items) {
      expect(photo.src.kecil).toMatch(/^\/wam\/demo\/foto-\d\d\.svg$/);
      expect(photo.src.besar).toBe(photo.src.kecil);
      expect(existsSync(fileOf(photo.src.besar!)), photo.src.besar!).toBe(true);
      expect(statSync(fileOf(photo.src.besar!)).size).toBeLessThan(30_000);
      expect(photo.owner.name).toMatch(/\S/);
      expect(photo.status).toBe("tampil");
    }
    expect(page!.items.some(photo => photo.reactions.length > 0)).toBe(true);
    expect(new Set(page!.items.map(photo => photo.sessionId)).size).toBeGreaterThan(2);
    // Newest first.
    const times = page!.items.map(photo => Date.parse(photo.visibleAt));
    expect(times).toEqual([...times].sort((a, b) => b - a));
  });

  it("every filter shows photos: Fotoku (the viewer's), and each session and Umum named in the counts", async () => {
    const mine = await demoFeed(context, { view: "saya", session: null, limit: 100 });
    expect(mine!.items.length).toBeGreaterThan(0);
    expect(mine!.items.every(photo => photo.mine && photo.owner.name === "Rani")).toBe(true);
    const counts = await demoSessionCounts(context, "semua");
    expect(counts!.reduce((sum, row) => sum + row.photos, 0)).toBe(DEMO_PHOTOS);
    for (const row of counts!) {
      const page = await demoFeed(context, { view: "semua", session: row.sessionId ?? UMUM, limit: 100 });
      expect(page!.items.length, String(row.sessionId)).toBe(row.photos);
      expect(page!.items.every(photo => !!photo.src.kecil)).toBe(true);
    }
  });

  it("uses all 24 different pictures", async () => {
    const page = await demoFeed(context, { view: "semua", session: null, limit: 100 });
    expect(new Set(page!.items.map(photo => photo.src.kecil)).size).toBe(24);
  });
});

describe("Mode demo's Mozaik", () => {
  it("fills about two thirds of the letters' cells with the sample pictures", async () => {
    const { columns, rows } = SAMPLE_MOSAIC_GRID;
    const empty = { version: "kosong", columns, rows, cells: letterCells(columns, rows, "WAM 2026"), tiles: [], filled: 0, total: columns * rows, people: 0, mine: 0, updatedAt: "2027-01-05T03:00:00Z", complete: false, migrated: false };
    const manifest = await demoMosaic(empty);
    expect(manifest!.tiles.length).toBeGreaterThan(100);
    expect(manifest!.tiles.every(tile => /^\/wam\/demo\/foto-\d\d\.svg$/.test(tile.src!))).toBe(true);
    expect(new Set(manifest!.tiles.map(tile => tile.src)).size).toBe(24);
    expect(cellOrder(columns, rows, "WAM 2026").length).toBe(columns * rows);
  });
});

describe("the sample pictures", () => {
  it("are 24 small local SVGs of made-up scenes (no outside address, no script, no embedded bitmap)", () => {
    for (let n = 1; n <= 24; n++) {
      const file = fileOf(`/wam/demo/foto-${String(n).padStart(2, "0")}.svg`);
      expect(existsSync(file), file).toBe(true);
      const text = readFileSync(file, "utf8");
      expect(statSync(file).size).toBeLessThan(30_000);
      expect(text).toMatch(/viewBox="0 0 800 1000"/);
      expect(text).not.toMatch(/https?:\/\/(?!www\.w3\.org\/2000\/svg)|<script|<image|data:image/i);
    }
  });
});
