import { sampleSessionIds, samplePeople } from "@/lib/main-wam/sample";
import type { RankPerson } from "./rank";
import type { MwCompletion, MwMission } from "./types";

/*
 * Misi's sample data (Mode demo and dev-preview), from the prototype: five missions (two done), 118
 * people of whom the asker ranks 7th with 340 points. Every name is made up. Never used outside Mode
 * demo and tests; the server reads it only while the tables are empty.
 */

/** Same shape as sample.ts: a fixed valid uuid per row; sample rows start with 00000000-0000-4000-8. */
const uid = (kind: number, n: number) => `00000000-0000-4000-8${String(kind).padStart(3, "0")}-${String(n).padStart(12, "0")}`;
export const isSampleMission = (id: string) => id.startsWith("00000000-0000-4000-8009");

const base = { description: "", placeName: "", latitude: null, longitude: null, radiusM: null, sessionId: null, credit: "panitia", review: false, opensAt: null, closesAt: null, active: true } as const;

export const sampleMissions: MwMission[] = [
  { ...base, id: uid(9, 1), title: "Foto bareng tim di Aula", description: "Foto bersama timmu di Aula Utama.", kind: "foto", points: 20, sort: 1 },
  { ...base, id: uid(9, 2), title: "Bagikan cerita di Team building", description: "Ceritakan satu pengalaman kerjamu di sesi Team building.", kind: "sesi", points: 50, sessionId: sampleSessionIds["team-building"], credit: "panitia", sort: 2 },
  { ...base, id: uid(9, 3), title: "Foto apel Kota Batu", description: "Foto dirimu atau timmu di depan tugu apel Alun-alun Batu.", kind: "foto", points: 40, placeName: "Alun-alun Batu", latitude: -7.8707, longitude: 112.5283, radiusM: 50, sort: 3 },
  { ...base, id: uid(9, 4), title: "Jelajah Taman Kota", description: "Datangi Taman Kota dan check-in di sana.", kind: "checkin", points: 30, placeName: "Taman Kota", latitude: -7.8742, longitude: 112.5271, radiusM: 50, sort: 4 },
  { ...base, id: uid(9, 5), title: "Sapa rekan lintas departemen", description: "Kenalan dengan rekan dari departemen lain, lalu ceritakan di sesi Team building.", kind: "sesi", points: 30, sessionId: sampleSessionIds["team-building"], credit: "absen", sort: 5 },
];

/** The asker's completions: the first and the fifth done (so "Berhasil" has two rows). */
export const sampleCompletions = (employeeId: string): MwCompletion[] => [sampleMissions[0], sampleMissions[4]].map((mission, index) => ({
  id: uid(11, index + 1), missionId: mission.id, employeeId, source: mission.kind === "foto" ? "foto" : "absen", status: "disetujui", hasProof: mission.kind === "foto",
  latitude: null, longitude: null, accuracyM: null, distanceM: null, takenAt: null, note: "", reviewedBy: null, reviewedAt: null, reviewNote: "", createdAt: "2027-01-05T08:00:00+07:00",
}));

const FIRST = ["Aditya", "Bagas", "Citra", "Dian", "Eka", "Farah", "Galih", "Hesti", "Indra", "Jihan", "Kirana", "Lukman", "Mira", "Nadia", "Oka", "Panji", "Qori", "Rizky", "Salsa", "Tegar", "Umar", "Vina", "Wisnu", "Yuni", "Zaki"];
const LAST = "ABDHKMPRSTW";
const DEPARTMENTS = ["CoE", "Finance", "IT", "Comms", "HRGA", "Sales & Marketing", "Art & Creative Support", "Corporate"];
const TOP = [620, 580, 540, 490, 440, 390];

/** 118 people, Rani (the asker) 7th with 340 points; the others are made up, with a spread of points below her. */
export function sampleBoard(meId: string, meName = samplePeople.rani.name, total = 118): RankPerson[] {
  const people: RankPerson[] = [];
  for (let index = 0; index < total; index++) {
    const me = index === 6;
    const points = index < 6 ? TOP[index] : index === 6 ? 340 : Math.max(0, 335 - (index - 7) * 3);
    people.push({
      id: me ? meId : uid(10, index + 1),
      name: me ? meName : `${FIRST[(index * 7 + 3) % FIRST.length]} ${LAST[(index * 5) % LAST.length]}.`,
      department: DEPARTMENTS[(index * 3) % DEPARTMENTS.length],
      points, missions: Math.max(0, Math.min(5, Math.round(points / 70))),
    });
  }
  return people;
}
