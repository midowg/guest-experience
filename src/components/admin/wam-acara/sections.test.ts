import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import config from "../../../../next.config";
import { mainWamAdminPath } from "@/lib/routes";
import { wamAcaraCrumbs, wamAcaraGroups, wamAcaraMenuKey, wamAcaraSection, wamAcaraSectionAt, wamAcaraSections } from "./sections";
import { wamAcaraNavGroups } from "./WamAcaraNav";

/* Admin WAM 2026 (20 Nov 2026, KONTRAK §15): Main WAM's admin, its own door at /admin/wam2026. */

describe("Admin WAM 2026 sections", () => {
  it("give every section its own key and address under /admin/wam2026", () => {
    expect(new Set(wamAcaraSections.map(section => section.key)).size).toBe(wamAcaraSections.length);
    expect(new Set(wamAcaraSections.map(section => section.href)).size).toBe(wamAcaraSections.length);
    for (const section of wamAcaraSections) expect(section.href === "/admin/wam2026" || section.href.startsWith("/admin/wam2026/"), section.href).toBe(true);
    expect(wamAcaraSections[0].href).toBe("/admin/wam2026");
  });

  it("hold every page Main WAM had in Admin WAM, plus Panitia WAM", () => {
    expect(wamAcaraSections.map(section => section.key)).toEqual(["ringkasan", "pengaturan", "panitia", "isi", "kamar", "perjalanan", "panduan", "info", "modul", "silent", "kuis"]);
    const groups = wamAcaraGroups();
    expect(groups.map(group => group.label)).toEqual(["Ikhtisar", "Persiapan", "Untuk peserta"]);
    expect(groups.flatMap(group => group.sections.map(section => section.key))).toEqual(["ringkasan", "pengaturan", "panitia", "isi", "modul"]);
    expect(wamAcaraMenuKey("kamar")).toBe("isi");
    expect(wamAcaraMenuKey("kuis")).toBe("modul");
    for (const section of wamAcaraSections) if (section.owner) expect(wamAcaraSection(section.owner).owner).toBeUndefined();
    expect(wamAcaraNavGroups().flatMap(group => group.items.map(item => item.href))).toContain(mainWamAdminPath.committee);
  });

  it("build the breadcrumb under its name, one constant", () => {
    expect(wamAcaraCrumbs("panitia")).toEqual([{ label: "Admin WAM 2026", href: "/admin/wam2026" }, { label: "Persiapan" }, { label: "Panitia WAM" }]);
    expect(wamAcaraCrumbs("kuis", "Kuis WAM").map(step => step.label)).toEqual(["Admin WAM 2026", "Untuk peserta", "Modul acara", "Kuis live", "Kuis WAM"]);
  });

  it("find the section of a path, one quiz included", () => {
    expect(wamAcaraSectionAt("/admin/wam2026/").key).toBe("ringkasan");
    expect(wamAcaraSectionAt(mainWamAdminPath.quiz("k1")).key).toBe("kuis");
    expect(wamAcaraSectionAt(mainWamAdminPath.rundown).key).toBe("isi");
  });

  it("have a page for every section", () => {
    const app = new URL("../../../app/", import.meta.url);
    for (const section of wamAcaraSections) expect(readdirSync(new URL(`.${section.href}/`, app)), section.href).toContain("page.tsx");
  });
});

describe("the old address /admin/wam/main", () => {
  it("redirects to Admin WAM 2026 (checked there), every page with it", async () => {
    const redirects = await config.redirects!();
    const to = (source: string) => redirects.find(rule => rule.source === source);
    expect(to("/admin/wam/main")).toMatchObject({ destination: "/admin/wam2026", permanent: false });
    expect(to("/admin/wam/main/:path*")).toMatchObject({ destination: "/admin/wam2026/:path*", permanent: false });
    // No page is left at the old address.
    const old = new URL("../../../app/admin/wam/main/", import.meta.url);
    expect(() => readdirSync(old)).toThrow();
  });
});

function routes(dir: URL): string[] {
  const root = decodeURIComponent(dir.pathname.replace(/^\/([A-Za-z]:)/, "$1"));
  const walk = (path: string): string[] => readdirSync(path).flatMap(name => {
    const full = join(path, name);
    return statSync(full).isDirectory() ? walk(full) : name === "route.ts" ? [full] : [];
  });
  return walk(root);
}

describe("who may use Admin WAM 2026's APIs", () => {
  it("every one checks the admin session first (the area check gives wam_acara holders and the super admin only)", () => {
    const files = routes(new URL("../../../app/api/admin/wam2026/", import.meta.url));
    expect(files.length).toBeGreaterThan(20);
    for (const file of files) expect(readFileSync(file, "utf8"), file).toContain("requireApiAdmin()");
    // The old APIs are gone.
    expect(() => readdirSync(new URL("../../../app/api/admin/wam/main/", import.meta.url))).toThrow();
  });
});
