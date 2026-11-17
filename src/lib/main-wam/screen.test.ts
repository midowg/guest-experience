import { describe, expect, it } from "vitest";
import { mainWamPath } from "@/lib/routes";
import { mainWamScreen, mainWamTabs, showsBell, showsBottomBar } from "./screen";

const at = (path: string) => mainWamScreen(path.split("?")[0]);

describe("Main WAM's frame, from the address alone", () => {
  it("has four tabs, the same for every role", () => {
    expect(mainWamTabs.map(tab => [tab.key, tab.label, tab.href])).toEqual([
      ["beranda", "Beranda", "/wam/acara"], ["agenda", "Agenda", "/wam/acara/agenda"], ["momen", "Momen", "/wam/acara/momen"], ["saya", "Saya", "/wam/acara/saya"],
    ]);
  });

  it("draws the tab roots with the bottom bar, the bell on Beranda only, Momen dark", () => {
    for (const [path, tab] of [[mainWamPath.home, "beranda"], [mainWamPath.agenda(), "agenda"], [mainWamPath.moments(), "momen"], [mainWamPath.me, "saya"]] as const) {
      expect(at(path)).toMatchObject({ tab, level: "akar" });
      expect(showsBottomBar(at(path))).toBe(true);
      expect(showsBell(at(path))).toBe(tab === "beranda");
    }
    expect(at(mainWamPath.moments())?.dark).toBe(true);
    expect(at(`${mainWamPath.home}/`)).toMatchObject({ tab: "beranda", level: "akar" });
  });

  it("keeps the bottom bar on detail screens, with the tab they belong to and a way back", () => {
    const cases: [string, string, string, string][] = [
      [mainWamPath.session("s1"), "agenda", "Detail sesi", mainWamPath.agenda()],
      [mainWamPath.notifications, "beranda", "Notifikasi", mainWamPath.home],
      [mainWamPath.gallery(), "momen", "Galeri", mainWamPath.moments()],
      [mainWamPath.mosaic(), "momen", "Mozaik", mainWamPath.moments()],
      [mainWamPath.groupRoom, "saya", "Kelompok & kamar", mainWamPath.me],
      [mainWamPath.travel("pulang"), "saya", "Perjalanan", mainWamPath.me],
      [mainWamPath.guides, "saya", "Panduan", mainWamPath.me],
      [mainWamPath.guide("denah-venue"), "saya", "Panduan", mainWamPath.guides],
      [mainWamPath.settings, "saya", "Pengaturan", mainWamPath.me],
      [mainWamPath.rundownLive(2), "beranda", "Rundown live", mainWamPath.home],
      [mainWamPath.attendanceManual("s1"), "beranda", "Absen sesi", mainWamPath.home],
      [mainWamPath.moderation("disembunyikan"), "beranda", "Moderasi Momen", mainWamPath.home],
      [mainWamPath.attendanceSummary(), "beranda", "Kehadiran", mainWamPath.home],
      [mainWamPath.silentRecap, "beranda", "Rekap Silent Meeting", mainWamPath.home],
      [mainWamPath.awardApproval, "beranda", "Persetujuan awarding", mainWamPath.home],
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

  it("drops the bottom bar on task screens (camera, scan, forms)", () => {
    for (const path of [mainWamPath.camera(), mainWamPath.scan, mainWamPath.checkIn("tok"), mainWamPath.silentMeeting(), mainWamPath.awardCategory("c1"), mainWamPath.announce, mainWamPath.onboarding]) {
      expect(at(path)?.level, path).toBe("tugas");
      expect(showsBottomBar(at(path)), path).toBe(false);
    }
    expect(at(mainWamPath.camera())?.dark).toBe(true);
  });

  it("draws no frame outside Main WAM, or on its sign-in page", () => {
    expect(mainWamScreen("/wam")).toBeNull();
    expect(mainWamScreen("/wam/agenda")).toBeNull();
    expect(mainWamScreen("/wam/acarax")).toBeNull();
    expect(at(mainWamPath.login("/wam/acara"))).toBeNull();
  });
});
