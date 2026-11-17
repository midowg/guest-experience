import { describe, expect, it } from "vitest";
import { activityGroupFromRow, awardFromRow, groupFromRow, guideFromRow, photoFromRow, rundownChangeFromRow, sessionFromRow, silentFromRow, tripFromRow } from "./rows";
import { themeImageKey, isThemeImageKey, themeInputOf } from "./theme-image";
import { sampleActivityGroups, sampleGroup4, sampleRoom3, sampleRoom5, sampleSessions, sampleViewer, sampleViewers } from "./sample";

describe("database rows to Main WAM's types", () => {
  it("read a session with its defaults, its lineup cleaned", () => {
    const session = sessionFromRow({
      id: "s1", title: "Pemaparan departemen", kind: "sesi", status: "terbit", starts_at: "2027-01-05T01:00:00+00:00", ends_at: null, place: "Aula Utama",
      lineup: [{ time: "08.00", label: "Sales & Marketing" }, { label: "" }, "x"], uses_attendance: true, module: "komitmen", sort: "2",
    });
    expect(session).toMatchObject({ kind: "sesi", status: "terbit", endsAt: null, usesAttendance: true, required: false, module: "silent", sort: 2, dresscode: "" });
    expect(session.lineup).toEqual([{ time: "08.00", label: "Sales & Marketing" }]);
    expect(sessionFromRow({ id: "s2", kind: "rapat", status: "?" })).toMatchObject({ kind: "sesi", status: "draf", module: null });
  });

  it("put the koordinator first in a kelompok", () => {
    const group = groupFromRow({ id: "g4", number: 4, name: "Arjuno", sort: 0, mw_group_members: [{ employee_id: "rani", coordinator: false }, { employee_id: "fajar", coordinator: true }] });
    expect(group.members.map(member => member.employeeId)).toEqual(["fajar", "rani"]);
  });

  it("read the other entities", () => {
    expect(activityGroupFromRow({ id: "a", session_id: "s", kind: "angkot", label: "Angkot 3", mw_activity_group_members: [{ employee_id: "rani" }] })).toMatchObject({ kind: "angkot", members: ["rani"] });
    expect(tripFromRow({ id: "t", direction: "pulang", kind: "kereta", title: "Kereta", distance_km: "350.0", vehicles: null })).toMatchObject({ direction: "pulang", distanceKm: 350, vehicles: null });
    expect(guideFromRow({ id: "g", slug: "denah", kind: "denah", title: "Denah", file_key: "main-wam/panduan/x.pdf", file_mime: "application/pdf", file_size: 10, updated_at: "2026-11-17T00:00:00Z" }).file)
      .toEqual({ mime: "application/pdf", size: 10, version: String(Date.parse("2026-11-17T00:00:00Z")) });
    expect(guideFromRow({ id: "g", slug: "hotel", title: "Hotel" }).file).toBeNull();
    expect(photoFromRow({ id: "p", owner_id: "rani", audience: "kelompok", group_id: "g4", status: "ditinjau", width: 1600, height: 2000 })).toMatchObject({ audience: "kelompok", groupId: "g4", status: "ditinjau", sessionId: null });
    expect(rundownChangeFromRow({ id: "l", session_id: "s", changes: [{ field: "endsAt", from: "a", to: "b" }, { field: "harga" }], notified: true, recipients: 122 }).changes).toEqual([{ field: "endsAt", from: "a", to: "b" }]);
    expect(silentFromRow({ id: "q", session_id: "s", question: "Apa?", topics: ["Cara kerja", 3], opened_at: "2027-01-05T05:40:00Z", closed_at: null }))
      .toEqual({ id: "q", sessionId: "s", question: "Apa?", topics: ["Cara kerja"], openedAt: "2027-01-05T05:40:00Z", closedAt: null });
    const award = awardFromRow({ id: "c", title: "Rekan", method: "voting", nominee_kind: "orang", published: true, mw_award_nominees: [{ id: "n2", category_id: "c", label: "B", sort: 2 }, { id: "n1", category_id: "c", label: "A", sort: 1 }] });
    expect(award.nominees.map(nominee => nominee.id)).toEqual(["n1", "n2"]);
  });
});

describe("theme images", () => {
  it("are kept under main-wam/tema by slot, and handed to the theme as addresses with their version", () => {
    const key = themeImageKey("splash", "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", "image/webp");
    expect(key).toBe("main-wam/tema/splash-aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.webp");
    expect(isThemeImageKey(key, "splash")).toBe(true);
    expect(isThemeImageKey(key, "icon")).toBe(false);
    const input = themeInputOf({ colors: { accent: "#1E3A5F" }, displayFont: null, images: { splash: { key, version: "17", mime: "image/webp" } } });
    expect(input).toMatchObject({ accent: "#1E3A5F", displayFont: null });
    expect(input.images).toEqual({ splash: "/api/wam/acara/tema/splash?v=17", homeHeader: null, pattern: null, mosaic: null, icon: null });
  });
});

describe("the sample data", () => {
  it("follows the prototype: Kelompok 4 · Arjuno of 10 with its koordinator, rooms of 3 and of 5", () => {
    expect(sampleGroup4).toMatchObject({ number: 4, name: "Arjuno" });
    expect(sampleGroup4.members).toHaveLength(10);
    expect(sampleGroup4.members.filter(member => member.coordinator)).toHaveLength(1);
    expect(sampleRoom3.people.map(person => person.name)).toEqual(["Rani", "Sari", "Dewi"]);
    expect(sampleRoom5.people).toHaveLength(5);
    expect(sampleActivityGroups.map(group => group.label)).toEqual(["Pos 2", "Angkot 3", "Meja 7"]);
  });

  it("has a four-day rundown with valid, unique ids, and a viewer per role", () => {
    const days = new Set(sampleSessions.map(session => session.startsAt.slice(0, 10)));
    expect([...days]).toEqual(["2027-01-04", "2027-01-05", "2027-01-06", "2027-01-07"]);
    expect(new Set(sampleSessions.map(session => session.id)).size).toBe(sampleSessions.length);
    for (const session of sampleSessions) expect(session.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    // A meal never takes a check-in (the table refuses it).
    expect(sampleSessions.some(session => session.kind === "makan" && session.usesAttendance)).toBe(false);
    expect(Object.keys(sampleViewers)).toEqual(["peserta", "panitia", "bod", "admin"]);
    expect(sampleViewer("bod").roles).toEqual(["bod"]);
    expect(sampleViewer("asing").name).toBe("Rani");
  });
});
