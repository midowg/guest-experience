import { describe, expect, it } from "vitest";
import { HIDDEN_MAIN_WAM, visibilityFromRow } from "./main-wam-visibility";
import { wamSections } from "@/components/admin/wam/sections";
import { wamNavGroups } from "@/components/admin/wam/WamNav";

/*
 * Main WAM tersembunyi (20 Nov 2026): hidden from the app until the super admin shows it. Since the two doors
 * (KONTRAK §15) the switch is the app's only: Admin Pra WAM never has Main WAM, shown or not, and Admin WAM 2026
 * is not hidden by it.
 */

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

describe("Admin Pra WAM has no Main WAM at all", () => {
  it("no section, menu item or search entry for Main WAM (old or new address), whatever the switch", () => {
    const hrefs = [...wamSections.map(section => section.href), ...wamNavGroups().flatMap(group => group.items.map(item => item.href))];
    expect(hrefs.some(href => href.startsWith("/admin/wam/main") || href.startsWith("/admin/wam2026"))).toBe(false);
    expect(wamNavGroups().map(group => group.label)).not.toContain("Main WAM");
  });
});
