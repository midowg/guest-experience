import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/*
 * Privacy of the photo's position (docs/main-wam/KONTRAK.md §13): the coordinates are written once, to their own table, and read in one
 * place, only to match missions. No feed, API answer, screen or completion ever carries them. This test reads the source: the columns
 * of the position appear nowhere else, so a new reader cannot add them by accident.
 */

const root = join(process.cwd(), "src");
const files = (dir: string): string[] => readdirSync(dir).flatMap(name => {
  const path = join(dir, name);
  return statSync(path).isDirectory() ? files(path) : /\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) ? [path] : [];
});
const where = (needle: RegExp) => files(root).filter(file => needle.test(readFileSync(file, "utf8"))).map(file => relative(root, file).replace(/\\/g, "/")).sort();

describe("the position of a photo", () => {
  it("is named in one server file only (the store of detection), nowhere in a feed, a screen or an API", () => {
    expect(where(/geo_lat|geo_lng|geo_acc/)).toEqual(["lib/server/main-wam/misi/deteksi-store.ts"]);
  });

  it("is read by detection only: no other file asks the store for signals", () => {
    expect(where(/\bsignalsOf\b/)).toEqual(["lib/server/main-wam/misi/deteksi-store.ts", "lib/server/main-wam/misi/deteksi.ts"]);
  });

  it("is never put in a photo of the feed, a mission completion or the detection a phone reads", () => {
    for (const path of ["lib/server/main-wam/momen/feed.ts", "lib/main-wam/momen/types.ts", "lib/main-wam/misi/rows.ts", "lib/main-wam/misi/types.ts", "lib/main-wam/misi/missions.ts"]) {
      expect(readFileSync(join(root, path), "utf8"), path).not.toMatch(/geo|signal/i);
    }
  });

  it("the table behind it is closed to everyone but the server", () => {
    const sql = readFileSync(join(process.cwd(), "supabase/migrations/wam-2026/202611300003_main_wam_misi_deteksi.sql"), "utf8");
    expect(sql).toMatch(/enable row level security/);
    expect(sql).toMatch(/revoke all on public\.mw_photo_signals[^;]*from public, anon, authenticated/);
    expect(sql).not.toMatch(/grant [^;]*mw_photo_signals[^;]*(anon|authenticated)/);
    expect(sql).toMatch(/photo_id uuid primary key references public\.mw_photos \(id\) on delete cascade/);
  });
});
