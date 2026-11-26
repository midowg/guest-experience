import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { coffeeAdminPath } from "@/lib/routes";
import { coffeeAdminNavGroups } from "./CoffeeAdminNav";
import { COFFEE_ADMIN_LABEL, coffeeAdminGroups, coffeeAdminSections, sectionOfPath } from "./sections";

const fsPath = (url: URL) => decodeURIComponent(url.pathname.replace(/^\/([A-Za-z]:)/, "$1"));
function routes(dir: URL): string[] {
  const walk = (path: string): string[] => readdirSync(path).flatMap(name => {
    const full = join(path, name);
    return statSync(full).isDirectory() ? walk(full) : name === "route.ts" ? [full] : [];
  });
  return walk(fsPath(dir));
}

describe("WG Coffee admin's sections", () => {
  it("are Antrean, Rekap and Pengaturan, each with its own key, an address under /admin/coffee, and a page", () => {
    expect(COFFEE_ADMIN_LABEL).toBe("WG Coffee");
    expect(coffeeAdminSections.map(section => section.label)).toEqual(["Antrean", "Rekap", "Pengaturan"]);
    expect(new Set(coffeeAdminSections.map(section => section.key)).size).toBe(coffeeAdminSections.length);
    expect(coffeeAdminSections[0].href).toBe(coffeeAdminPath.home);
    for (const section of coffeeAdminSections) {
      expect(section.href.startsWith("/admin/coffee")).toBe(true);
      const page = new URL(`../../app${section.href.split("?")[0]}/page.tsx`, import.meta.url);
      expect(existsSync(fsPath(page)), section.href).toBe(true);
    }
    expect(existsSync(fsPath(new URL("../../app/admin/coffee/loading.tsx", import.meta.url)))).toBe(true);
  });
  it("group the menu: the orders, then the settings", () => {
    expect(coffeeAdminGroups().map(group => group.label)).toEqual(["Pesanan", "Pengaturan"]);
  });
  it("find the section of an address, with or without a query", () => {
    expect(sectionOfPath(coffeeAdminPath.home)).toBe("antrean");
    expect(sectionOfPath(coffeeAdminPath.manual)).toBe("antrean");
    expect(sectionOfPath(coffeeAdminPath.recap("2026-11"))).toBe("rekap");
    expect(sectionOfPath(`${coffeeAdminPath.settings}/`)).toBe("pengaturan");
    expect(sectionOfPath("/admin")).toBeNull();
    expect(sectionOfPath(null)).toBeNull();
  });
  it("show how many orders wait beside Antrean only, and nothing when none wait", () => {
    const items = (waiting: number) => coffeeAdminNavGroups(waiting).flatMap(group => group.items);
    expect(items(3).find(item => item.key === "antrean")).toMatchObject({ badge: "3", badgeLabel: "pesanan menunggu" });
    expect(items(3).filter(item => item.badge)).toHaveLength(1);
    expect(items(0).some(item => item.badge)).toBe(false);
  });
});

describe("who may use WG Coffee admin's APIs", () => {
  it("every one checks the admin session first (the area check gives coffee holders and the super admin only)", () => {
    const files = routes(new URL("../../app/api/admin/coffee/", import.meta.url));
    expect(files.length).toBeGreaterThan(8);
    for (const file of files) expect(readFileSync(file, "utf8"), file).toContain("requireApiAdmin()");
  });
});
