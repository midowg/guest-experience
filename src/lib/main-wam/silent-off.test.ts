import { describe, expect, it } from "vitest";
import { pickHomeCard } from "./home-card";
import { moduleInfo, activeModules, activeModulesLabel } from "./modules";
import { attentionItems } from "./panitia/attention";
import { summaryRows } from "./panitia/summary";
import { onboardingNews } from "./peserta/onboarding";
import { sampleSession, sampleSettings } from "./sample";
import { defaultSettings, parseModules } from "./settings";

/*
 * Silent Meeting is Pra WAM's, not Main WAM's (decision of the owner, 18 Nov 2026): its module is off by
 * default and, off, leaves no trace anywhere the module could show: Beranda's card, Detail sesi's action,
 * the panitia hub's attention list, BOD's Ringkasan, onboarding's example. (Detail sesi, Rundown live and
 * the pages and APIs are checked where their server code is tested.)
 */

const off = { ...sampleSettings().modules, silent: false };

describe("Silent Meeting, module off", () => {
  it("is off by default, in a fresh settings row, an empty row, and in the labels of what is on", () => {
    expect(defaultSettings().modules.silent).toBe(false);
    expect(parseModules({})).toMatchObject({ silent: false });
    expect(parseModules({ absen: true })).toMatchObject({ silent: false });
    expect(activeModules(off)).not.toContain("silent");
    expect(activeModulesLabel(off)).not.toContain("Silent Meeting");
  });

  it("tells the admin whose module it is, next to its switch", () => {
    expect(moduleInfo.silent.note).toBe("Silent Meeting dipakai di Pra WAM; nyalakan hanya bila acara WAM memang memakainya.");
    expect(moduleInfo.absen.note).toBeUndefined();
  });

  it("has no Beranda card, even when a session's Silent Meeting is open", () => {
    const open = { kind: "silent" as const, questionId: "q", sessionId: "s", closesAt: "2027-01-05T09:00:00Z" };
    expect(pickHomeCard([open], off, new Date("2027-01-05T08:00:00Z"))).toBeNull();
    expect(pickHomeCard([open], { ...off, silent: true }, new Date("2027-01-05T08:00:00Z"))?.kind).toBe("silent");
  });

  it("has no row in BOD's Ringkasan and no line in the panitia hub's Perlu perhatian", () => {
    expect(summaryRows({ modules: off, attendance: { percent: 93, day: 3 }, awards: { pending: 2, approved: 1 }, silentFeedback: 47, silentOpen: true, carbonKg: 13_640 }).map(row => row.key)).not.toContain("silent");
    expect(attentionItems({ modules: { ...off, absen: false }, reported: 0, required: [], silent: [{ session: sampleSession("silent"), day: 2 }] })).toEqual([]);
  });

  it("does not show Silent Meeting in the notification example of onboarding", () => {
    expect(onboardingNews(off).example.body).not.toMatch(/Silent/i);
    expect(onboardingNews({ ...off, silent: true }).example.body).toMatch(/Silent/i);
  });
});
