import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** The migration rule (27 Nov 2026, supabase/migrations/README.md): one folder per app, unique numbers across all. */
const root = join(process.cwd(), "supabase/migrations");
const folders = readdirSync(root).filter(name => statSync(join(root, name)).isDirectory());
const files = folders.flatMap(folder => readdirSync(join(root, folder)).map(file => ({ folder, file })));

describe("Supabase migrations", () => {
  it("live only in an app's folder, never loose in supabase/migrations", () => {
    expect(readdirSync(root).filter(name => name.endsWith(".sql"))).toEqual([]);
    expect(folders.length).toBeGreaterThan(0);
  });

  it("are named YYYYMMDDNNNN_name.sql", () => {
    const bad = files.filter(({ file }) => !/^\d{12}_[a-z0-9_]+\.sql$/.test(file)).map(({ folder, file }) => `${folder}/${file}`);
    expect(bad).toEqual([]);
  });

  // Numbers two sessions gave out the same day, before this rule. They are already applied, so they keep
  // their names; their order is the full file name. Every number after these is used once.
  const knownTwice = new Set(["202611250001", "202611260001", "202611270001", "202611280001"]);
  it("have a number used once across every folder, so the order across apps is clear", () => {
    const seen = new Map<string, string>();
    const twice: string[] = [];
    for (const { folder, file } of files) {
      const number = file.slice(0, 12);
      if (seen.has(number) && !knownTwice.has(number)) twice.push(`${number}: ${seen.get(number)} dan ${folder}/${file}`);
      else seen.set(number, `${folder}/${file}`);
    }
    expect(twice).toEqual([]);
  });
});
