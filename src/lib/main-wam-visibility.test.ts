import { describe, expect, it } from "vitest";
import { HIDDEN_MAIN_WAM, visibilityFromRow } from "./main-wam-visibility";
import { hiddenMainWamSections, mainWamSectionKeys, wamSections } from "@/components/admin/wam/sections";
import { wamNavGroups } from "@/components/admin/wam/WamNav";

/* Main WAM tersembunyi (20 Nov 2026): hidden until the super admin shows it; Admin WAM without Main WAM meanwhile. */

describe("whether Main WAM shows", () => {
  it("is hidden unless the row says exactly true (and before the migration)", () => {
    expect(HIDDEN_MAIN_WAM.shown).toBe(false);
    expect(visibilityFromRow(null)).toMatchObject({ shown: false, migrated: true });
    expect(visibilityFromRow({ main_wam_shown: "true" }).shown).toBe(false);
    expect(visibilityFromRow({ main_wam_shown: 1 }).shown).toBe(false);
    expect(visibilityFromRow({ main_wam_shown: true, main_wam_shown_at: "2026-11-20T10:00:00Z", main_wam_shown_by: "Super admin" }))
      .toEqual({ shown: true, migrated: true, changedAt: "2026-11-20T10:00:00Z", changedBy: "Super admin" });
  });
});

describe("Admin WAM while Main WAM is hidden", () => {
  const groupLabels = (without: readonly string[]) => wamNavGroups({}, without as never[]).filter(group => group.items.length).map(group => group.label);
  const items = (without: readonly string[]) => wamNavGroups({}, without as never[]).flatMap(group => group.items.map(item => item.href));

  it("knows Main WAM's sections: Pengaturan, Isi acara and its tabs, Modul acara and its tabs (Kuis live too)", () => {
    expect(mainWamSectionKeys).toEqual(["mw-pengaturan", "mw-isi", "mw-kamar", "mw-perjalanan", "mw-panduan", "mw-info", "mw-modul", "mw-silent", "mw-kuis"]);
    expect(wamSections.filter(section => section.href.startsWith("/admin/wam/main")).map(section => section.key)).toEqual(mainWamSectionKeys);
  });

  it("hidden: no Main WAM entry in the menu (nor its search, which reads the same list)", () => {
    const without = hiddenMainWamSections(true, "ringkasan");
    expect(groupLabels(without)).not.toContain("Main WAM");
    expect(items(without).some(href => href.startsWith("/admin/wam/main"))).toBe(false);
    expect(hiddenMainWamSections(true)).toEqual([...mainWamSectionKeys]);
  });

  it("shown: the menu as before", () => {
    expect(hiddenMainWamSections(false, "ringkasan")).toEqual([]);
    expect(groupLabels(hiddenMainWamSections(false))).toContain("Main WAM");
  });

  it("on Main WAM's own pages (opened by their address) its menu stays, so the WAM team can move between them", () => {
    expect(hiddenMainWamSections(true, "mw-kuis")).toEqual([]);
    expect(hiddenMainWamSections(true, "mw-pengaturan")).toEqual([]);
  });
});
