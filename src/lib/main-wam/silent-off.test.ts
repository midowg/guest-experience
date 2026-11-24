import { describe, expect, it } from "vitest";
import { pickHomeCard } from "./home-card";
import { moduleInfo, activeModules, activeModulesLabel } from "./modules";
import { attentionItems } from "./panitia/attention";
import { onboardingNews } from "./peserta/onboarding";
import { sampleSession, sampleSettings } from "./sample";
import { defaultSettings, parseModules } from "./settings";

/*
 * Silent Meeting is Pra WAM's, not Main WAM's (decision of the owner, 18 Nov 2026): its module is off by
 * default and, off, leaves no trace anywhere the module could show: Beranda's card, Detail sesi's action,
 * the panitia hub's attention list, onboarding's example. (Detail sesi, Rundown live and
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

  it("has no line in the panitia hub's Perlu perhatian", () => {
    expect(attentionItems({ modules: { ...off, absen: false }, reported: 0, required: [], silent: [{ session: sampleSession("silent"), day: 2 }] })).toEqual([]);
  });

  it("does not show Silent Meeting in the notification example of onboarding", () => {
    expect(onboardingNews(off).example.body).not.toMatch(/Silent/i);
    expect(onboardingNews({ ...off, silent: true }).example.body).toMatch(/Silent/i);
  });
});

describe("modules hidden from the app", () => {
  it("lists Silent Meeting and voting, forces them off for the app, and leaves the rest as saved", async () => {
    const { APP_HIDDEN_MODULES, appModules } = await import("./modules");
    expect([...APP_HIDDEN_MODULES]).toEqual(["silent", "voting"]);
    const saved = { ...sampleSettings().modules, silent: true, voting: true, absen: true };
    expect(appModules(saved)).toMatchObject({ silent: false, voting: false, absen: true });
    expect(saved.silent).toBe(true);
  });
});
