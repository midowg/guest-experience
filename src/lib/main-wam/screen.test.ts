import { describe, expect, it } from "vitest";
import { mainWamPath } from "@/lib/routes";
import { mainWamScreen, mainWamTabs, mainWamTabsFor, showsBell, showsBottomBar } from "./screen";

const at = (path: string) => mainWamScreen(path.split("?")[0]);

describe("Main WAM's frame, from the address alone", () => {
  it("has four tabs, the same for every role", () => {
    expect(mainWamTabs.map(tab => [tab.key, tab.label, tab.href])).toEqual([
      ["beranda", "Beranda", "/wam2026"], ["agenda", "Agenda", "/wam2026/agenda"], ["momen", "Momen", "/wam2026/momen"], ["saya", "Saya", "/wam2026/saya"],
    ]);
  });

  it("adds Panitia at the right end, after Saya, only when asked (the viewer is panitia)", () => {
    expect(mainWamTabsFor(false)).toEqual(mainWamTabs);
    expect(mainWamTabsFor(true).map(tab => [tab.key, tab.label, tab.href, tab.icon])).toEqual([
      ...mainWamTabs.map(tab => [tab.key, tab.label, tab.href, tab.icon]), ["panitia", "Panitia", "/wam2026/kelola", "clipboard-list"],
    ]);
  });

  it("draws the Panitia hub as the root of its tab, and every panitia tool under it with the tab lit and back to the hub", () => {
    expect(at(mainWamPath.committee)).toMatchObject({ tab: "panitia", level: "akar", title: "Panitia" });
    expect(mainWamScreen(mainWamPath.committee, "en")).toMatchObject({ tab: "panitia", title: "Committee" });
    expect(showsBottomBar(at(mainWamPath.committee))).toBe(true);
    expect(showsBell(at(mainWamPath.committee))).toBe(false);
    for (const [path, title] of [[mainWamPath.rundownLive(2), "Rundown live"], [mainWamPath.attendanceManual("s1"), "Absen sesi"], [mainWamPath.moderation("disembunyikan"), "Moderasi Momen"]] as const) {
      expect(at(path), path).toMatchObject({ tab: "panitia", level: "detail", title });
      expect(at(path)?.back?.href, path).toBe(mainWamPath.committee);
      expect(showsBottomBar(at(path)), path).toBe(true);
    }
    expect(at(mainWamPath.announce)).toMatchObject({ tab: "panitia", level: "tugas", back: { href: mainWamPath.committee } });
    expect(showsBottomBar(at(mainWamPath.announce))).toBe(false);
  });

  it("draws the tab roots with the bottom bar, the bell on Beranda only", () => {
    for (const [path, tab] of [[mainWamPath.home, "beranda"], [mainWamPath.agenda(), "agenda"], [mainWamPath.moments(), "momen"], [mainWamPath.me, "saya"]] as const) {
      expect(at(path)).toMatchObject({ tab, level: "akar" });
      expect(showsBottomBar(at(path))).toBe(true);
      expect(showsBell(at(path))).toBe(tab === "beranda");
    }
    // Momen follows the app's theme like every tab; only the camera is dark.
    expect(at(mainWamPath.moments())?.camera).toBeUndefined();
    expect(at(`${mainWamPath.home}/`)).toMatchObject({ tab: "beranda", level: "akar" });
  });

  it("keeps the bottom bar on detail screens, with the tab they belong to and a way back", () => {
    const cases: [string, string, string, string][] = [
      [mainWamPath.notifications, "beranda", "Notifikasi", mainWamPath.home],
      [mainWamPath.gallery(), "momen", "Galeri", mainWamPath.moments()],
      [mainWamPath.mosaic(), "momen", "Mozaik WAM 2026", mainWamPath.moments()],
      [mainWamPath.room, "saya", "Kamar", mainWamPath.me],
      [mainWamPath.carbon(), "beranda", "Jejak karbon", mainWamPath.home],
      [mainWamPath.carbon("saya"), "saya", "Jejak karbon", mainWamPath.me],
      [mainWamPath.travel("pulang"), "saya", "Perjalanan", mainWamPath.me],
      [mainWamPath.guides, "saya", "Panduan", mainWamPath.me],
      [mainWamPath.guide("denah-venue"), "saya", "Panduan", mainWamPath.guides],
      [mainWamPath.settings, "saya", "Pengaturan", mainWamPath.me],
      [mainWamPath.help, "saya", "Bantuan", mainWamPath.me],
      [mainWamPath.rundownLive(2), "panitia", "Rundown live", mainWamPath.committee],
      [mainWamPath.attendanceManual("s1"), "panitia", "Absen sesi", mainWamPath.committee],
      [mainWamPath.moderation("disembunyikan"), "panitia", "Moderasi Momen", mainWamPath.committee],
      [mainWamPath.attendanceSummary(), "beranda", "Kehadiran", mainWamPath.home],
      [mainWamPath.silentRecap, "beranda", "Rekap Silent Meeting", mainWamPath.home],
      // B06 (revisi 16 Nov, T-K05): "Awarding".
      [mainWamPath.awardApproval, "beranda", "Awarding", mainWamPath.home],
      [mainWamPath.awards, "beranda", "Awarding", mainWamPath.home],
    ];
    for (const [path, tab, title, back] of cases) {
      const screen = at(path);
      expect(screen, path).toMatchObject({ tab, level: "detail", title });
      expect(screen?.back?.href, path).toBe(back);
      expect(showsBottomBar(screen), path).toBe(true);
      expect(showsBell(screen), path).toBe(false);
    }
  });

  it("draws Agenda's own frame behind Detail sesi, which is a sheet over it (P04)", () => {
    expect(at(mainWamPath.session("s1"))).toMatchObject({ tab: "agenda", level: "akar", title: "Agenda" });
    expect(at(mainWamPath.agendaPrep(3))).toMatchObject({ tab: "agenda", level: "akar" });
  });

  it("drops the bottom bar on task screens (camera, scan, forms)", () => {
    for (const path of [mainWamPath.camera(), mainWamPath.scan, mainWamPath.checkIn("tok"), mainWamPath.silentMeeting(), mainWamPath.awardCategory("c1"), mainWamPath.announce, mainWamPath.onboarding]) {
      expect(at(path)?.level, path).toBe("tugas");
      expect(showsBottomBar(at(path)), path).toBe(false);
    }
    expect(at(mainWamPath.camera())?.camera).toBe(true);
    expect(at(mainWamPath.scan)?.camera).toBeUndefined();
  });

  it("draws no frame outside Main WAM, or on its sign-in page", () => {
    expect(mainWamScreen("/wam")).toBeNull();
    expect(mainWamScreen("/wam/agenda")).toBeNull();
    expect(mainWamScreen("/wam2026x")).toBeNull();
    expect(at(mainWamPath.login("/wam2026"))).toBeNull();
  });
});
