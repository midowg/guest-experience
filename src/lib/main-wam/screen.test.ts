import { describe, expect, it } from "vitest";
import { mainWamPath } from "@/lib/routes";
import { isSessionSheetPath, mainWamScreen, mainWamTabs, mainWamTabsFor, showsBell, showsBottomBar } from "./screen";

const at = (path: string) => mainWamScreen(path.split("?")[0]);

describe("Main WAM's frame, from the address alone", () => {
  it("Momen's root titles Terbaru under a small Momen label (eyebrow); other tab roots have none", () => {
    expect(at(mainWamPath.moments())).toMatchObject({ title: "Terbaru", eyebrow: "Momen" });
    expect(at(mainWamPath.agenda())?.eyebrow).toBeUndefined();
  });

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
      expect(showsBottomBar(at(path)), path).toBe(false);
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

  it("drops the bottom bar on every detail screen (a page opened from a tab), which keeps its tab as a family and has a way back", () => {
    const cases: [string, string, string, string][] = [
      [mainWamPath.notifications, "beranda", "Notifikasi", mainWamPath.home],
      [mainWamPath.mosaic(), "momen", "Mozaik WAM 2026", mainWamPath.moments()],
      [mainWamPath.gallery(), "momen", "Galeri", mainWamPath.moments()],
      [mainWamPath.gallery("ditandai"), "momen", "Galeri", mainWamPath.moments()],
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
      [mainWamPath.awards, "beranda", "Awarding", mainWamPath.home],
    ];
    for (const [path, tab, title, back] of cases) {
      const screen = at(path);
      expect(screen, path).toMatchObject({ tab, level: "detail", title });
      expect(screen?.back?.href, path).toBe(back);
      expect(showsBottomBar(screen), path).toBe(false);
      expect(showsBell(screen), path).toBe(false);
    }
  });

  it("shows the bottom bar on the tab roots alone, and the bell on Beranda's root alone, for every address the app has", () => {
    const addresses = [mainWamPath.home, mainWamPath.agenda(), mainWamPath.agenda(2), mainWamPath.agendaPrep(3), mainWamPath.moments(), mainWamPath.me, mainWamPath.committee,
      mainWamPath.notifications, mainWamPath.missions, mainWamPath.mosaic(), mainWamPath.gallery(), mainWamPath.camera(), mainWamPath.room, mainWamPath.travel("pulang"), mainWamPath.guides, mainWamPath.guide("denah-venue"),
      mainWamPath.settings, mainWamPath.help, mainWamPath.carbon(), mainWamPath.carbon("saya"), mainWamPath.awards, mainWamPath.scan, mainWamPath.silentMeeting(), mainWamPath.rundownLive(2), mainWamPath.announce];
    const roots = new Set([mainWamPath.home, mainWamPath.agenda(), mainWamPath.agenda(2), mainWamPath.agendaPrep(3), mainWamPath.moments(), mainWamPath.me, mainWamPath.committee]);
    for (const path of addresses) {
      expect(showsBottomBar(at(path)), path).toBe(roots.has(path));
      expect(showsBell(at(path)), path).toBe(path === mainWamPath.home);
    }
  });

  it("knows a session's own address (the sheet), and no other", () => {
    expect(isSessionSheetPath(mainWamPath.session("s-1"))).toBe(true);
    expect(isSessionSheetPath(`${mainWamPath.session("s-1")}/`)).toBe(true);
    for (const path of [mainWamPath.agenda(), mainWamPath.agenda(2), mainWamPath.agendaPrep(3), mainWamPath.home, mainWamPath.moments(), `${mainWamPath.session("s-1")}/x`]) expect(isSessionSheetPath(path), path).toBe(false);
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
