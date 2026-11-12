import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { wamAdminPath } from "@/lib/routes";
import { wamCrumbs, wamGroups, wamMenuKey, wamSection, wamSectionAt, wamSections } from "./sections";

describe("Admin WAM sections", () => {
  it("give every section its own key and address under /admin/wam", () => {
    expect(new Set(wamSections.map(section => section.key)).size).toBe(wamSections.length);
    expect(new Set(wamSections.map(section => section.href)).size).toBe(wamSections.length);
    for (const section of wamSections) expect(section.href.startsWith(wamAdminPath.home)).toBe(true);
    expect(wamSections[0].href).toBe("/admin/wam");
  });

  it("leave units and positions to Data karyawan", () => {
    expect(wamSections.map(section => section.key)).toEqual(["ringkasan", "akun", "reset", "mcp", "acara", "about", "tema", "ruang", "tv", "telegram", "lemari", "kuesioner"]);
    expect(Object.values(wamAdminPath)).not.toContain("/admin/wam/unit");
  });

  it("group the menu in the order the sections are listed, leaving tab-only pages out", () => {
    const groups = wamGroups();
    expect(groups.map(group => group.label)).toEqual(["Ikhtisar", "Orang", "Aplikasi", "Data peserta"]);
    expect(groups.flatMap(group => group.sections)).toEqual(wamSections.filter(section => !section.owner));
    expect(groups.find(group => group.label === "Orang")!.sections.map(section => section.key)).toEqual(["akun", "mcp"]);
  });

  it("make Permintaan reset a tab of Akun dan peran, with its own address kept", () => {
    expect(wamSection("reset").owner).toBe("akun");
    expect(wamSection("reset").href).toBe(wamAdminPath.resetRequests);
    expect(wamMenuKey("reset")).toBe("akun");
    expect(wamMenuKey("ruang")).toBe("ruang");
    // An owner is always a menu item itself.
    for (const section of wamSections) if (section.owner) expect(wamSection(section.owner).owner).toBeUndefined();
  });

  it("build the breadcrumb: Admin WAM, the group, the section, then any extra step", () => {
    expect(wamCrumbs("akun")).toEqual([{ label: "Admin WAM", href: "/admin/wam" }, { label: "Orang" }, { label: "Akun dan peran" }]);
    expect(wamCrumbs("akun", "Peran")).toEqual([{ label: "Admin WAM", href: "/admin/wam" }, { label: "Orang" }, { label: "Akun dan peran", href: wamAdminPath.accounts }, { label: "Peran" }]);
    expect(wamCrumbs("reset").map(step => step.label)).toEqual(["Admin WAM", "Orang", "Akun dan peran", "Permintaan reset password"]);
    expect(wamCrumbs("reset")[2].href).toBe(wamAdminPath.accounts);
    expect(wamCrumbs("kuesioner", { label: "Rekap", href: wamAdminPath.questionnaire.recap }).at(-1)).toEqual({ label: "Rekap" });
  });

  it("find the section of a path, a deeper one included", () => {
    expect(wamSectionAt("/admin/wam").key).toBe("ringkasan");
    expect(wamSectionAt("/admin/wam/").key).toBe("ringkasan");
    expect(wamSectionAt(wamAdminPath.accounts).key).toBe("akun");
    expect(wamSectionAt(`${wamAdminPath.rooms}/detail`).key).toBe("ruang");
    expect(wamSection("reset").href).toBe(wamAdminPath.resetRequests);
    expect(wamSectionAt(wamAdminPath.questionnaire.settings).key).toBe("kuesioner");
    expect(wamSectionAt(wamAdminPath.questionnaire.hrData).key).toBe("kuesioner");
  });

  it("have a page for every section", () => {
    const app = new URL("../../../app/", import.meta.url);
    for (const section of wamSections) {
      expect(readdirSync(new URL(`.${section.href}/`, app)), section.href).toContain("page.tsx");
    }
  });
});

/** Every route file under a folder of src/app/api. */
function routes(dir: URL): string[] {
  const root = dir.pathname.replace(/^\/([A-Za-z]:)/, "$1");
  const walk = (path: string): string[] => readdirSync(path).flatMap(name => {
    const full = join(path, name);
    return statSync(full).isDirectory() ? walk(full) : name === "route.ts" ? [full] : [];
  });
  return walk(decodeURIComponent(root));
}

describe("who may use Admin WAM", () => {
  const api = new URL("../../../app/api/admin/", import.meta.url);

  // The unit import sits on Data karyawan, beside the workbook it reads: super admin only.
  const superOnly = ["units"];
  const isSuperOnly = (file: string) => superOnly.some(name => file.replace(/\\/g, "/").includes(`/wam/${name}/`));

  it("lets any signed-in admin call the WAM admin APIs", () => {
    const files = routes(new URL("wam/", api)).filter(file => !isSuperOnly(file));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toContain("requireSuperAdmin");
      expect(source, file).toContain("requireApiAdmin()");
    }
  });

  it("keeps the unit import (matched by NIP) with the super admin", () => {
    const files = routes(new URL("wam/", api)).filter(isSuperOnly);
    expect(files).toHaveLength(superOnly.length);
    for (const file of files) expect(readFileSync(file, "utf8"), file).toContain("requireSuperAdmin()");
  });

  it("keeps Data karyawan (NIP, personal details) with the super admin", () => {
    const files = routes(new URL("employees/", api));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) expect(readFileSync(file, "utf8"), file).toContain("requireSuperAdmin()");
  });
});
