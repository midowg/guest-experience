import {
  sampleActivityGroups, sampleGroups, sampleGuides, samplePeople, sampleRoom3, sampleRoom5, sampleRundownLog, sampleSeats, sampleSessionIds, sampleSessions,
  sampleSessionsChanged, sampleSettings, sampleTrips,
} from "../sample";
import type { MainWamSettings } from "../types";
import type { AdminPerson } from "./people";
import type { AdminSession, SessionUsage } from "./rundown";

/*
 * Sample data of Admin WAM → Main WAM's isi acara pages, for dev-preview and tests only (agen E).
 * Built on fondasi's sample (made-up names, src/lib/main-wam/sample.ts); admin views show full names.
 */

/** Everyone of the sample, by full name, plus a few without a kelompok. */
export const sampleAdminPeople: AdminPerson[] = Object.values(samplePeople)
  .map(person => ({ id: person.id, fullName: person.fullName, name: person.name, department: person.department }))
  .sort((a, b) => a.fullName.localeCompare(b.fullName, "id"));

/** What a few sample sessions already have (Hapus is then Batalkan); the rest have nothing. */
const sampleUsage: Record<string, Partial<SessionUsage>> = {
  wellness: { photos: 8 }, pemaparan: { attendance: 96, photos: 12 }, silent: { silent: true, attendance: 41 }, "team-building": { activityGroups: 6 }, gala: { awards: 2, photos: 30 },
};
const NOTHING: SessionUsage = { attendance: 0, photos: 0, silent: false, awards: 0, activityGroups: 0 };

/** The rundown as the admin sees it: the changed schedule, two drafts, one cancelled, and what each already has. */
export function sampleAdminSessions(): AdminSession[] {
  const draftKeys = new Set(["refleksi", "pasar"]);
  return sampleSessionsChanged().map((plain, index) => {
    const key = Object.keys(sampleSessionIds).find(name => sampleSessionIds[name] === plain.id) ?? "";
    const session: AdminSession = { ...plain, version: `2026-11-17T03:20:${String(index).padStart(2, "0")}.123456+00:00`, usage: { ...NOTHING, ...sampleUsage[key] } };
    if (draftKeys.has(key)) return { ...session, status: "draf" as const };
    if (key === "bns") return { ...session, status: "batal" as const };
    if (key === "pemaparan") return { ...session, mapGuideId: sampleGuides[0].id };
    return session;
  });
}
export const sampleAdminLog = sampleRundownLog;
export const sampleAdminGroups = sampleGroups;
export const sampleAdminActivityGroups = sampleActivityGroups;
export const sampleAdminTrips = sampleTrips;
export const sampleAdminSeats = sampleSeats;
export const sampleAdminGuides = sampleGuides.map((guide, index) => (index === 3 ? { ...guide, published: false } : guide));
export const sampleAdminSettings = (overrides: Partial<MainWamSettings> = {}): MainWamSettings => sampleSettings({ groupsPublished: false, ...overrides });
/** Untouched: the sample sessions with every status published (tests). */
export const sampleAdminPlainSessions = sampleSessions;

/** HR's pairing as Admin WAM → Main WAM → Kamar reads it. */
export function sampleAdminRooms() {
  const full = (id: string) => sampleAdminPeople.find(person => person.id === id)!;
  const room = (base: typeof sampleRoom3, capacity: number) => ({
    id: base.id, name: base.name, kind: base.kind, capacity, floor: base.floor, note: base.note,
    people: base.people.map(person => ({ id: person.id, fullName: full(person.id).fullName, department: person.department })),
  });
  return [
    { id: "00000000-0000-4000-8003-000000000101", name: "101", kind: "Suite", capacity: 1, floor: "Lantai 1", note: "", people: [{ id: samplePeople.arman.id, fullName: samplePeople.arman.fullName, department: "BOD" }] },
    room(sampleRoom3, 3),
    { id: "00000000-0000-4000-8003-000000000209", name: "209", kind: "Twin", capacity: 2, floor: "", note: "", people: [{ id: samplePeople.hana.id, fullName: samplePeople.hana.fullName, department: "Finance" }, { id: samplePeople.maya.id, fullName: samplePeople.maya.fullName, department: "CoE" }] },
    { id: "00000000-0000-4000-8003-000000000210", name: "210", kind: "Twin", capacity: 2, floor: "", note: "", people: [] },
    room(sampleRoom5, 5),
  ];
}
