import { describe, expect, it } from "vitest";
import { mainWamCan, moduleAllows } from "@/lib/main-wam/access";
import { moduleInfo } from "@/lib/main-wam/modules";
import { mainWamScreen } from "@/lib/main-wam/screen";
import { defaultSettings } from "@/lib/main-wam/settings";
import { MAIN_WAM_MODULES } from "@/lib/main-wam/types";
import { mainWamPath } from "@/lib/routes";
import { sampleSessionIds } from "@/lib/main-wam/sample";
import { distanceMeters, judgePosition, type Fix } from "./geo";
import { abbreviateDepartment, availabilityOf, canStart, chipsOf, filterItems, missionItems, nextMission, rulesOf, sections, sortItems, summarize, whenOf } from "./missions";
import { medalOf, myPlace, rankOrder, rankPeople } from "./rank";
import { completionFromRow, missionFromRow, settingsFromRow } from "./rows";
import { sampleBoard, sampleCompletions, sampleMissions } from "./sample";
import { grantSchema, manualPointsSchema, missionSchema, photoConfirmSchema, photoStartSchema, positionSchema, reviewSchema, settingsSchema } from "./schema";
import type { MwCompletion, MwMission } from "./types";

/*
 * Misi's rules without a server: the distance and the verdict on a position, the missions a person
 * sees (state, filter, order, what is next), the words of their requirements, the Peringkat (ties,
 * no ids, the asker's place), the rows from the database, the schemas, and the demo's sample.
 */

const ALUN = { latitude: -7.8707, longitude: 112.5283 };
const NOW = new Date("2027-01-05T10:00:00+07:00");

describe("distance and position", () => {
  it("measures great-circle metres: nothing for the same point, about 111 km per degree of latitude", () => {
    expect(distanceMeters(ALUN, ALUN)).toBe(0);
    const km = distanceMeters({ latitude: 0, longitude: 0 }, { latitude: 1, longitude: 0 }) / 1000;
    expect(km).toBeGreaterThan(110.5);
    expect(km).toBeLessThan(111.8);
    // 0.0005° of latitude is about 55 m.
    const near = distanceMeters(ALUN, { latitude: ALUN.latitude + 0.0005, longitude: ALUN.longitude });
    expect(near).toBeGreaterThan(54);
    expect(near).toBeLessThan(57);
  });

  const at = (dLat: number, accuracy: number | null, extra: Partial<Fix> = {}): Fix => ({ latitude: ALUN.latitude + dLat, longitude: ALUN.longitude, accuracy, ...extra });
  const judge = (fix: Fix, over: { target?: typeof ALUN | null; radiusM?: number; maxAccuracyM?: number } = {}) =>
    judgePosition({ fix, target: over.target === undefined ? ALUN : over.target, radiusM: over.radiusM ?? 50, maxAccuracyM: over.maxAccuracyM ?? 100, now: NOW });

  it("accepts a fix inside the circle and says how far", () => {
    const verdict = judge(at(0.0001, 12));
    expect(verdict).toEqual({ ok: true, distanceM: expect.any(Number) });
    expect(verdict.distanceM).toBeGreaterThanOrEqual(10);
    expect(verdict.distanceM).toBeLessThanOrEqual(12);
  });

  it("refuses a fix outside the circle, with the distance", () => {
    const verdict = judge(at(0.001, 12));
    expect(verdict).toMatchObject({ ok: false, reason: "terlalu-jauh" });
    expect(verdict.distanceM).toBeGreaterThan(100);
  });

  it("refuses a fix that is too coarse, even a close one (the circle is judged by its centre)", () => {
    expect(judge(at(0, 250))).toMatchObject({ ok: false, reason: "tidak-akurat" });
    expect(judge(at(0, null))).toMatchObject({ ok: false, reason: "tidak-akurat" });
    expect(judge(at(0, 100))).toMatchObject({ ok: true });
    expect(judge(at(0, 100), { maxAccuracyM: 30 })).toMatchObject({ ok: false, reason: "tidak-akurat" });
  });

  it("refuses coordinates that are not a place, and a fix older than five minutes by its own stamp", () => {
    expect(judge({ latitude: 91, longitude: 0, accuracy: 5 })).toMatchObject({ ok: false, reason: "tidak-valid" });
    expect(judge({ latitude: Number.NaN, longitude: 0, accuracy: 5 })).toMatchObject({ ok: false, reason: "tidak-valid" });
    expect(judge(at(0, 5, { at: "2027-01-05T09:40:00+07:00" }))).toMatchObject({ ok: false, reason: "kedaluwarsa" });
    expect(judge(at(0, 5, { at: "2027-01-05T09:58:00+07:00" }))).toMatchObject({ ok: true });
    expect(judge(at(0, 5, { at: "bukan tanggal" }))).toMatchObject({ ok: false, reason: "kedaluwarsa" });
  });

  it("without a place (a photo mission with no point) any usable fix passes and nothing is measured", () => {
    expect(judge(at(0.5, 30), { target: null })).toEqual({ ok: true, distanceM: null });
    expect(judge(at(0.5, 300), { target: null })).toMatchObject({ ok: false, reason: "tidak-akurat" });
  });
});

const mission = (over: Partial<MwMission> & Pick<MwMission, "id" | "title">): MwMission => ({
  description: "", kind: "foto", points: 20, placeName: "", latitude: null, longitude: null, radiusM: null, sessionId: null, credit: "panitia", review: false,
  opensAt: null, closesAt: null, sort: 0, active: true, ...over,
});
const done = (missionId: string, status: MwCompletion["status"] = "disetujui", reviewNote = ""): Pick<MwCompletion, "missionId" | "status" | "reviewNote"> => ({ missionId, status, reviewNote });

describe("the missions a person sees", () => {
  const list = [
    mission({ id: "a", title: "Foto tim", points: 20, sort: 1 }),
    mission({ id: "b", title: "Cerita", kind: "sesi", sessionId: "s1", points: 50, sort: 2 }),
    mission({ id: "c", title: "Apel", points: 40, sort: 3, latitude: ALUN.latitude, longitude: ALUN.longitude, radiusM: 80, placeName: "Alun-alun Batu" }),
    mission({ id: "d", title: "Taman", kind: "checkin", points: 30, sort: 4, latitude: 1, longitude: 2 }),
    mission({ id: "x", title: "Mati", active: false, sort: 0 }),
  ];
  const ctx = { sessions: [{ id: "s1", title: "Team building" }], settings: { defaultRadiusM: 50 }, now: NOW };

  it("lists the active missions in the admin's order, with the radius that applies and the session's name", () => {
    const items = missionItems(list, [], ctx);
    expect(items.map(item => item.id)).toEqual(["a", "b", "c", "d"]);
    expect(items.find(item => item.id === "c")).toMatchObject({ radiusM: 80, hasPlace: true, placeName: "Alun-alun Batu" });
    expect(items.find(item => item.id === "d")).toMatchObject({ radiusM: 50, hasPlace: true });
    expect(items.find(item => item.id === "a")).toMatchObject({ hasPlace: false });
    expect(items.find(item => item.id === "b")?.sessionTitle).toBe("Team building");
  });

  it("never carries the coordinates of a mission to the phone", () => {
    const json = JSON.stringify(missionItems(list, [], ctx));
    expect(json).not.toContain("latitude");
    expect(json).not.toContain(String(ALUN.latitude));
  });

  it("tells done, waiting, turned down and still to do apart", () => {
    const items = missionItems(list, [done("a"), done("b", "menunggu"), done("c", "ditolak", "Bukan di tugu")], ctx);
    expect(items.map(item => item.status)).toEqual(["done", "pending", "rejected", "todo"]);
    expect(items[2].rejectedNote).toBe("Bukan di tugu");
    expect(items[0].rejectedNote).toBe("");
  });

  it("knows a mission that has not opened and one that has closed", () => {
    expect(availabilityOf({ opensAt: "2027-01-05T11:00:00+07:00", closesAt: null }, NOW)).toBe("belum");
    expect(availabilityOf({ opensAt: null, closesAt: "2027-01-05T10:00:00+07:00" }, NOW)).toBe("tutup");
    expect(availabilityOf({ opensAt: "2027-01-05T09:00:00+07:00", closesAt: "2027-01-05T21:00:00+07:00" }, NOW)).toBe("buka");
    const items = missionItems([mission({ id: "e", title: "Tutup", closesAt: "2027-01-05T09:00:00+07:00" })], [], ctx);
    expect(items[0].availability).toBe("tutup");
    expect(canStart(items[0])).toBe(false);
  });

  it("summarises: counts, points available (open ones not yet done) and earned", () => {
    const items = missionItems(list, [done("a"), done("b", "menunggu")], ctx);
    expect(summarize(items)).toEqual({ total: 4, done: 1, pending: 1, availablePoints: 50 + 40 + 30, earnedPoints: 20 });
    const closed = missionItems([mission({ id: "e", title: "Tutup", points: 99, closesAt: "2027-01-05T09:00:00+07:00" })], [], ctx);
    expect(summarize(closed).availablePoints).toBe(0);
  });

  it("filters Semua, Belum (everything not done) and Berhasil, and orders by points keeping the admin's order for ties", () => {
    const items = missionItems([...list, mission({ id: "f", title: "Sama", points: 20, sort: 9 })], [done("a"), done("b", "menunggu")], ctx);
    expect(filterItems(items, "all")).toHaveLength(5);
    expect(filterItems(items, "todo").map(item => item.id)).toEqual(["b", "c", "d", "f"]);
    expect(filterItems(items, "done").map(item => item.id)).toEqual(["a"]);
    expect(sortItems(items, "desc").map(item => item.points)).toEqual([50, 40, 30, 20, 20]);
    expect(sortItems(items, "desc").slice(3).map(item => item.id)).toEqual(["a", "f"]);
    expect(sortItems(items, "asc").map(item => item.points)).toEqual([20, 20, 30, 40, 50]);
    const split = sections(items, "all", "desc");
    expect(split.todo.every(item => item.status !== "done")).toBe(true);
    expect(split.done.map(item => item.id)).toEqual(["a"]);
  });

  it("points Beranda at the first mission still to do and open, in the admin's order", () => {
    const items = missionItems(list, [done("a")], ctx);
    expect(nextMission(items)?.id).toBe("b");
    expect(nextMission(missionItems(list, [done("a"), done("b"), done("c"), done("d")], ctx))).toBeNull();
    // A waiting one is not "next"; a turned-down one can be sent again.
    expect(nextMission(missionItems(list, [done("a"), done("b", "menunggu")], ctx))?.id).toBe("c");
    expect(nextMission(missionItems([list[0]], [done("a", "ditolak")], ctx))?.id).toBe("a");
  });
});

describe("the words of a mission", () => {
  const base = { description: "", points: 40, placeName: "", hasPlace: false, radiusM: 50, sessionId: null, sessionTitle: null, credit: "panitia" as const, review: false, opensAt: null, closesAt: null, rejectedNote: "", status: "todo" as const, availability: "buka" as const };
  it("gives the chips under a title per kind", () => {
    expect(chipsOf({ kind: "foto" }).map(chip => chip.title)).toEqual(["Foto langsung", "Lokasi aktif"]);
    expect(chipsOf({ kind: "checkin" }).map(chip => chip.title)).toEqual(["Check-in lokasi"]);
    expect(chipsOf({ kind: "sesi" }).map(chip => chip.title)).toEqual(["Selesai di sesi"]);
    expect(chipsOf({ kind: "foto" }, "en").map(chip => chip.title)).toEqual(["Live photo", "Location on"]);
  });

  it("writes 'Syarat dapat poin' from the mission, in both languages", () => {
    const photo = rulesOf({ ...base, id: "p", title: "Apel", kind: "foto", hasPlace: true, placeName: "Alun-alun Batu", radiusM: 50, closesAt: "2027-01-05T21:00:00+07:00" });
    expect(photo.map(rule => rule.title)).toEqual(["Foto langsung dari kamera", "Lokasi aktif dan di area misi", "Berlaku sampai Sel, 5 Jan 21.00"]);
    expect(photo[0].note).toBe("Hanya dari kamera aplikasi. Foto dari galeri tidak dihitung.");
    expect(photo[1].note).toBe("Berada dalam radius 50 m dari Alun-alun Batu saat memotret.");
    expect(rulesOf({ ...base, id: "p", title: "Apel", kind: "foto", hasPlace: true, placeName: "Alun-alun Batu" }, "en")[1].note).toBe("Be within 50 m of Alun-alun Batu when you take the photo.");
    const noPlace = rulesOf({ ...base, id: "p", title: "Tim", kind: "foto" });
    expect(noPlace[1].title).toBe("Lokasi aktif");
    expect(noPlace.at(-1)?.title).toBe("Satu kali");
    const checkin = rulesOf({ ...base, id: "k", title: "Taman", kind: "checkin", hasPlace: true, placeName: "Taman Kota", radiusM: 30 });
    expect(checkin[0].note).toBe("Check-in hanya bisa bila kamu dalam radius 30 m dari Taman Kota.");
    const session = rulesOf({ ...base, id: "s", title: "Cerita", kind: "sesi", sessionId: "s1", sessionTitle: "Team building", credit: "absen", review: false });
    expect(session[0]).toMatchObject({ title: "Dilakukan di sesi Team building", note: "Tercatat otomatis saat kamu absen di sesi ini." });
    expect(rulesOf({ ...base, id: "p", title: "x", kind: "foto", review: true }).some(rule => rule.title === "Ditinjau panitia")).toBe(true);
  });

  it("says 'Berlaku mulai' for a mission that has not opened", () => {
    const rules = rulesOf({ ...base, id: "p", title: "x", kind: "foto", opensAt: "2027-01-06T08:00:00+07:00", availability: "belum" });
    expect(rules.at(-1)?.title).toBe("Berlaku mulai Rab, 6 Jan 08.00");
    expect(whenOf("2027-01-06T08:00:00+07:00", "en")).toBe("Wed, 6 Jan 08:00");
  });

  it("shortens a department for the Peringkat", () => {
    expect(abbreviateDepartment("Sales & Marketing")).toBe("SM");
    expect(abbreviateDepartment("Center of Excellence")).toBe("CoE");
    expect(abbreviateDepartment("Human Resources & General Affair")).toBe("HRGA");
    expect(abbreviateDepartment("Art & Creative Support")).toBe("ACS");
    expect(abbreviateDepartment("CoE")).toBe("CoE");
    expect(abbreviateDepartment("Finance")).toBe("Finance");
    expect(abbreviateDepartment("Departemen Operasional Lapangan")).toBe("DOL");
    expect(abbreviateDepartment("")).toBe("");
  });
});

describe("the Peringkat", () => {
  const people = [
    { id: "1", name: "Dimas", department: "CoE", points: 100, missions: 3 },
    { id: "2", name: "Ayu", department: "Finance", points: 100, missions: 3 },
    { id: "3", name: "Citra", department: "Sales & Marketing", points: 80, missions: 2 },
    { id: "4", name: "Bima", department: "", points: 0, missions: 0 },
    { id: "5", name: "Eka", department: "IT", points: 0, missions: 0 },
  ];

  it("shares a place between equal points and skips the next (1, 1, 3, 4, 4)", () => {
    expect(rankPeople(people, "3").map(row => [row.rank, row.name])).toEqual([[1, "Ayu"], [1, "Dimas"], [3, "Citra"], [4, "Bima"], [4, "Eka"]]);
  });

  it("carries no id and only the asker's row is marked", () => {
    const rows = rankPeople(people, "3");
    expect(rows.map(row => Object.keys(row).sort())).toEqual(rows.map(() => ["department", "me", "name", "points", "rank"]));
    expect(rows.filter(row => row.me).map(row => row.name)).toEqual(["Citra"]);
    expect(rows.find(row => row.name === "Citra")?.department).toBe("SM");
    expect(JSON.stringify(rows)).not.toMatch(/"id"/);
  });

  it("keeps ids only for Admin WAM, which names everyone in full", () => {
    expect(rankOrder(people)[0]).toMatchObject({ id: "2", rank: 1 });
  });

  it("finds the asker's place among everyone ranked", () => {
    expect(myPlace(rankPeople(people, "3"))).toEqual({ rank: 3, of: 5, points: 80 });
    expect(myPlace(rankPeople(people, "nobody"))).toBeNull();
    expect(medalOf(1)).toBe(1);
    expect(medalOf(3)).toBe(3);
    expect(medalOf(4)).toBeNull();
  });

  it("is stable: the same people always rank the same way", () => {
    expect(rankPeople([...people].reverse(), "1")).toEqual(rankPeople(people, "1"));
  });
});

describe("rows from the database", () => {
  it("falls back on every odd column instead of stopping a screen", () => {
    expect(missionFromRow({ id: "m", title: "T", kind: "aneh", points: "x", active: "ya", credit: null })).toMatchObject({ kind: "foto", points: 0, active: false, credit: "panitia", latitude: null, sessionId: null, review: false });
    expect(missionFromRow({ id: "m", title: "T", kind: "checkin", points: 30, latitude: -7.8, longitude: 112.5, radius_m: 40, active: true })).toMatchObject({ kind: "checkin", points: 30, latitude: -7.8, radiusM: 40, active: true });
    expect(completionFromRow({ id: "c", mission_id: "m", employee_id: "e", status: "???", source: "???", proof_key: "main-wam/misi/x.jpg" })).toMatchObject({ status: "menunggu", source: "panitia", hasProof: true });
    expect(completionFromRow({ id: "c", mission_id: "m", employee_id: "e", status: "ditolak", proof_key: null })).toMatchObject({ status: "ditolak", hasProof: false });
  });

  it("reads the settings with the example values when the row is missing or odd", () => {
    expect(settingsFromRow(null)).toEqual({ defaultRadiusM: 50, maxAccuracyM: 100, leaderboardOpen: true });
    expect(settingsFromRow({ default_radius_m: 30, max_accuracy_m: 60, leaderboard_open: false })).toEqual({ defaultRadiusM: 30, maxAccuracyM: 60, leaderboardOpen: false });
    expect(settingsFromRow({ default_radius_m: 5, max_accuracy_m: 99999 })).toEqual({ defaultRadiusM: 50, maxAccuracyM: 100, leaderboardOpen: true });
  });
});

describe("the schemas", () => {
  const ok = { title: "Foto apel", kind: "foto", points: 40 };
  it("accepts a mission and fills what is left out", () => {
    expect(missionSchema.parse(ok)).toMatchObject({ title: "Foto apel", points: 40, placeName: "", latitude: null, radiusM: null, credit: "panitia", review: false, active: false, sort: 0 });
  });

  it("holds the rules of a kind: check-in needs a point, a point needs both numbers, an active sesi needs its session", () => {
    expect(missionSchema.safeParse({ ...ok, kind: "checkin" }).success).toBe(false);
    expect(missionSchema.safeParse({ ...ok, kind: "checkin", latitude: -7.8, longitude: 112.5 }).success).toBe(true);
    expect(missionSchema.safeParse({ ...ok, latitude: -7.8 }).success).toBe(false);
    expect(missionSchema.safeParse({ ...ok, kind: "sesi", active: true }).success).toBe(false);
    expect(missionSchema.safeParse({ ...ok, kind: "sesi", active: false }).success).toBe(true);
    expect(missionSchema.safeParse({ ...ok, kind: "sesi", active: true, sessionId: "11111111-1111-4111-8111-111111111111" }).success).toBe(true);
  });

  it("refuses odd numbers, a window that ends before it starts, and unknown fields", () => {
    expect(missionSchema.safeParse({ ...ok, points: -1 }).success).toBe(false);
    expect(missionSchema.safeParse({ ...ok, points: 1001 }).success).toBe(false);
    expect(missionSchema.safeParse({ ...ok, points: 1.5 }).success).toBe(false);
    expect(missionSchema.safeParse({ ...ok, latitude: 95, longitude: 0 }).success).toBe(false);
    expect(missionSchema.safeParse({ ...ok, radiusM: 5 }).success).toBe(false);
    expect(missionSchema.safeParse({ ...ok, opensAt: "2027-01-05T12:00:00+07:00", closesAt: "2027-01-05T09:00:00+07:00" }).success).toBe(false);
    expect(missionSchema.safeParse({ ...ok, id: "x" }).success).toBe(false);
  });

  it("settings, review, grant, manual points and position", () => {
    expect(settingsSchema.safeParse({ defaultRadiusM: 50, maxAccuracyM: 100, leaderboardOpen: true }).success).toBe(true);
    expect(settingsSchema.safeParse({ defaultRadiusM: 5, maxAccuracyM: 100, leaderboardOpen: true }).success).toBe(false);
    expect(reviewSchema.safeParse({ status: "ditolak", note: "Bukan di tugu" }).success).toBe(true);
    expect(reviewSchema.safeParse({ status: "menunggu" }).success).toBe(false);
    expect(grantSchema.safeParse({ employeeId: "bukan uuid" }).success).toBe(false);
    const person = "11111111-1111-4111-8111-111111111111";
    expect(manualPointsSchema.safeParse({ employeeId: person, points: 10, note: "Bantu panitia" }).success).toBe(true);
    expect(manualPointsSchema.safeParse({ employeeId: person, points: -5, note: "Koreksi" }).success).toBe(true);
    expect(manualPointsSchema.safeParse({ employeeId: person, points: 0, note: "Nol" }).success).toBe(false);
    expect(manualPointsSchema.safeParse({ employeeId: person, points: 10, note: "" }).success).toBe(false);
    expect(positionSchema.safeParse({ latitude: -7.87, longitude: 112.5, accuracy: 12 }).success).toBe(true);
    expect(positionSchema.safeParse({ latitude: -7.87, longitude: 112.5 }).success).toBe(false);
    expect(positionSchema.safeParse({ latitude: 200, longitude: 112.5, accuracy: 12 }).success).toBe(false);
  });

  it("photo steps: sizes within Momen's limits, a token only on the second step", () => {
    const start = { clientId: "11111111-1111-4111-8111-111111111111", position: { latitude: -7.87, longitude: 112.5, accuracy: 12 }, size: 400_000, thumbSize: 40_000, width: 1280, height: 1600 };
    expect(photoStartSchema.safeParse(start).success).toBe(true);
    expect(photoStartSchema.safeParse({ ...start, size: 2_000_000 }).success).toBe(false);
    expect(photoStartSchema.safeParse({ ...start, thumbSize: 0 }).success).toBe(false);
    expect(photoConfirmSchema.safeParse(start).success).toBe(false);
    expect(photoConfirmSchema.safeParse({ ...start, token: `1767000000.${"a".repeat(64)}` }).success).toBe(true);
    expect(photoConfirmSchema.safeParse({ ...start, token: "x" }).success).toBe(false);
  });
});

describe("the sample for Mode demo", () => {
  it("has the prototype's five missions, two done by the asker", () => {
    expect(sampleMissions).toHaveLength(5);
    expect(new Set(sampleMissions.map(item => item.kind))).toEqual(new Set(["foto", "checkin", "sesi"]));
    expect(sampleMissions.find(item => item.kind === "sesi")?.sessionId).toBe(sampleSessionIds["team-building"]);
    const items = missionItems(sampleMissions, sampleCompletions("me"), { sessions: [], settings: { defaultRadiusM: 50 }, now: NOW });
    expect(items.filter(item => item.status === "done")).toHaveLength(2);
    expect(summarize(items).total).toBe(5);
  });

  it("ranks the asker 7th of 118 with 340 points, the others made up", () => {
    const board = rankPeople(sampleBoard("me", "Rani"), "me");
    expect(board).toHaveLength(118);
    expect(myPlace(board)).toEqual({ rank: 7, of: 118, points: 340 });
    expect(board[0].points).toBeGreaterThan(board[1].points);
  });
});

describe("where Misi sits in the app", () => {
  it("is a module, off by default, with its words for Admin WAM", () => {
    expect(MAIN_WAM_MODULES).toContain("misi");
    expect(defaultSettings().modules.misi).toBe(false);
    expect(moduleInfo.misi.label).toBe("Misi dan poin");
  });

  it("is for participants, panitia and admins, never BOD, and only while its module is on", () => {
    const on = { ...defaultSettings().modules, misi: true };
    const off = { ...on, misi: false };
    expect(mainWamCan({ roles: [] }, "misi")).toBe(true);
    expect(mainWamCan({ roles: ["panitia"] }, "misi")).toBe(true);
    expect(mainWamCan({ roles: ["admin"] }, "misi")).toBe(true);
    expect(mainWamCan({ roles: ["bod"] }, "misi")).toBe(false);
    expect(moduleAllows({ roles: [] }, "misi", on)).toBe(true);
    expect(moduleAllows({ roles: [] }, "misi", off)).toBe(false);
    expect(moduleAllows({ roles: ["bod"] }, "misi", on)).toBe(false);
  });

  it("has its screens in the frame: Misi under Beranda, Peringkat under Misi, Kerjakan misi as a task (no bottom bar)", () => {
    expect(mainWamScreen(mainWamPath.missions)).toMatchObject({ tab: "beranda", level: "detail", title: "Misi", back: { href: mainWamPath.home } });
    expect(mainWamScreen(mainWamPath.missionRank)).toMatchObject({ tab: "beranda", level: "detail", title: "Peringkat", back: { href: mainWamPath.missions } });
    expect(mainWamScreen(mainWamPath.missionDo("abc"))).toMatchObject({ tab: "beranda", level: "tugas", title: "Kerjakan misi", back: { href: mainWamPath.missions } });
    expect(mainWamScreen(mainWamPath.missions, "en")?.title).toBe("Missions");
    expect(mainWamScreen(mainWamPath.missionRank, "en")?.title).toBe("Leaderboard");
  });
});
