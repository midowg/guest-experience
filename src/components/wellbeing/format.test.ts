import { describe, expect, it } from "vitest";
import type { WbMyActivity, WbRules } from "@/lib/wellbeing/app-types";
import { activityMeta, catatErrors, dayLabel, firstError, greeting, groupByDay, initials, mergePages, num, previewPoints, signed, wibHour, type CatatDraft } from "./format";
import { sportIcon } from "./icons";
import { Bike, Dumbbell, Footprints, Medal, Waves } from "lucide-react";

const rules: WbRules = { backdateDays: 7, programStart: "2026-05-22", maxKcal: 3000, maxSteps: 60000, maxPhotos: 5 };
const today = "2026-11-17";
const draft = (change: Partial<CatatDraft> = {}): CatatDraft => ({ kind: "daily", code: "emotional.meditasi", mode: "fixed", fixedPoints: 70, date: today, steps: "", kcal: "", minutes: "", photos: 1, ...change });
const activity = (change: Partial<WbMyActivity>): WbMyActivity => ({
  id: "a", typeCode: "emotional.meditasi", typeName: "Meditasi", kind: "daily", dimension: "emotional", date: today, time: null, source: "manual", title: "Meditasi",
  steps: null, kcal: null, minutes: null, distanceM: null, note: "", photos: [], pointsClaimed: 70, points: 70, status: "approved", reason: null, createdAt: "2026-11-17T01:00:00.000Z", checked: false, photoKeys: [], ...change,
});

describe("numbers and dates", () => {
  it("formats in id-ID, with a real minus sign", () => {
    expect(num(12480)).toBe("12.480");
    expect(signed(450)).toBe("+450");
    expect(signed(-200)).toBe("−200");
  });
  it("names today and yesterday, else a short WIB date", () => {
    expect(dayLabel(today, today)).toBe("Hari ini");
    expect(dayLabel("2026-11-16", today)).toBe("Kemarin");
    expect(dayLabel("2026-11-09", today)).toMatch(/9 Nov/);
  });
  it("greets by the WIB hour", () => {
    expect(wibHour(new Date("2026-11-17T00:30:00Z"))).toBe(7);
    expect(greeting(7)).toBe("Selamat pagi");
    expect(greeting(13)).toBe("Selamat siang");
    expect(greeting(16)).toBe("Selamat sore");
    expect(greeting(20)).toBe("Selamat malam");
  });
  it("makes initials", () => {
    expect(initials("Dewi Contoh")).toBe("DC");
    expect(initials("  ")).toBe("?");
  });
});

describe("Catat checks", () => {
  it("needs a photo, and no more than the maximum", () => {
    expect(catatErrors(draft({ photos: 0 }), rules, today).photos).toBe("Tambahkan minimal 1 foto bukti.");
    expect(catatErrors(draft({ photos: 6 }), rules, today).photos).toBe("Maksimal 5 foto.");
    expect(catatErrors(draft(), rules, today)).toEqual({});
  });
  it("refuses a day this type is already logged on", () => {
    expect(catatErrors(draft({ loggedOn: [today] }), rules, today).date).toBe("Sudah kamu catat pada tanggal ini. Pilih tanggal lain.");
    expect(catatErrors(draft({ loggedOn: ["2026-11-16"] }), rules, today).date).toBeUndefined();
  });
  it("keeps the date within the back-dating window", () => {
    expect(catatErrors(draft({ date: "2026-11-18" }), rules, today).date).toBe("Tanggal tidak boleh setelah hari ini.");
    expect(catatErrors(draft({ date: "2026-11-09" }), rules, today).date).toBe("Paling lama 7 hari ke belakang.");
    expect(catatErrors(draft({ date: "2026-11-10" }), rules, today).date).toBeUndefined();
  });
  it("checks steps and kcal, and the sport", () => {
    expect(catatErrors(draft({ mode: "steps", steps: "" }), rules, today).steps).toBe("Isi jumlah langkah.");
    expect(catatErrors(draft({ mode: "steps", steps: "70000" }), rules, today).steps).toBe("Isi 100 sampai 60.000 langkah.");
    expect(catatErrors(draft({ mode: "steps", steps: "90" }), rules, today).steps).toBe("Isi 100 sampai 60.000 langkah.");
    expect(catatErrors(draft({ kind: "sport", code: null, mode: "kcal", kcal: "0" }), rules, today)).toMatchObject({ sport: "Pilih jenis olahraga.", kcal: "Isi kalori 1 sampai 3.000." });
    expect(catatErrors(draft({ kind: "sport", code: "sport.running", mode: "kcal", kcal: "400", minutes: "2000" }), rules, today).minutes).toBe("Durasi 1 sampai 1.440 menit.");
    expect(firstError(catatErrors(draft({ kind: "sport", code: null, mode: "kcal", photos: 0 }), rules, today))).toBe("sport");
  });
  it("previews the points the way the server counts them", () => {
    expect(previewPoints(draft(), rules)).toBe(70);
    expect(previewPoints(draft({ mode: "steps", steps: "9125" }), rules)).toBe(912);
    expect(previewPoints(draft({ mode: "kcal", kcal: "5000" }), rules)).toBe(3000);
    expect(previewPoints(draft({ mode: "kcal", kcal: "" }), rules)).toBe(0);
  });
});

describe("lists", () => {
  it("groups by day in the order the server sent (newest day first)", () => {
    const groups = groupByDay([
      activity({ id: "3", date: "2026-11-17", createdAt: "2026-11-17T05:00:00Z" }),
      activity({ id: "2", date: "2026-11-17", createdAt: "2026-11-17T01:00:00Z" }),
      activity({ id: "1", date: "2026-11-15", createdAt: "2026-11-16T01:00:00Z" }),
    ]);
    expect(groups.map(group => group.date)).toEqual(["2026-11-17", "2026-11-15"]);
    expect(groups[0].items.map(item => item.id)).toEqual(["3", "2"]);
  });
  it("merges more pages once, keeping the fresher copy", () => {
    const merged = mergePages([activity({ id: "1", points: 99 })], [activity({ id: "1", points: 1 }), activity({ id: "2" })]);
    expect(merged.map(item => [item.id, item.points])).toEqual([["1", 99], ["2", 70]]);
  });
  it("describes an activity in one grey line", () => {
    expect(activityMeta(activity({}))).toBe("Emosional");
    expect(activityMeta(activity({ steps: 9120 }))).toBe("9.120 langkah");
    expect(activityMeta(activity({ kind: "sport", source: "strava", distanceM: 5200, minutes: 34 }))).toBe("Strava · 5,2 km · 34 mnt");
  });
  it("finds a sport's icon from its code or name", () => {
    expect(sportIcon("sport.cycling")).toBe(Bike);
    expect(sportIcon("x", "Renang")).toBe(Waves);
    expect(sportIcon("sport.walking")).toBe(Footprints);
    expect(sportIcon("sport.workout")).toBe(Dumbbell);
    expect(sportIcon("sport.unknown", "Panahan")).toBe(Medal);
  });
});
