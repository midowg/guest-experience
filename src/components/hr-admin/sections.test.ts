import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { hrAdminPath } from "@/lib/routes";
import { hrAdminGroups, hrAdminSections } from "./sections";

const fsPath = (url: URL) => decodeURIComponent(url.pathname.replace(/^\/([A-Za-z]:)/, "$1"));
function routes(dir: URL): string[] {
  const walk = (path: string): string[] => readdirSync(path).flatMap(name => {
    const full = join(path, name);
    return statSync(full).isDirectory() ? walk(full) : name === "route.ts" ? [full] : [];
  });
  return walk(fsPath(dir));
}

describe("Admin HR's sections", () => {
  it("give every section its own key, an address under /admin/hr, and a page", () => {
    expect(new Set(hrAdminSections.map(section => section.key)).size).toBe(hrAdminSections.length);
    expect(hrAdminSections[0].href).toBe(hrAdminPath.home);
    for (const section of hrAdminSections) {
      expect(section.href.startsWith("/admin/hr")).toBe(true);
      const page = new URL(`../../app${section.href.split("?")[0]}/page.tsx`, import.meta.url);
      expect(existsSync(fsPath(page)), section.href).toBe(true);
    }
  });
  it("group the menu: overview, absensi, then settings", () => {
    expect(hrAdminGroups().map(group => group.label)).toEqual(["Ikhtisar", "Absensi", "Pengaturan"]);
  });
});

describe("who may use Admin HR's APIs", () => {
  it("every one checks the admin session first (the area check gives hr holders and the super admin only)", () => {
    const files = routes(new URL("../../app/api/admin/hr/", import.meta.url));
    expect(files.length).toBeGreaterThan(9);
    for (const file of files) expect(readFileSync(file, "utf8"), file).toContain("requireApiAdmin()");
    // The old in-app Kelola and its APIs are gone: the employees' app has no admin inside.
    expect(existsSync(fsPath(new URL("../../app/api/hr/kelola/", import.meta.url)))).toBe(false);
    expect(existsSync(fsPath(new URL("../../app/hr/(app)/kelola/", import.meta.url)))).toBe(false);
  });
});
