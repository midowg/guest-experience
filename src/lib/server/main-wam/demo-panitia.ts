import "server-only";
import { demoSample, samplePresence } from "@/lib/main-wam/demo-sample";
import type { AttendeeRow } from "@/lib/main-wam/panitia/attendance";
import type { ModerationCard } from "@/lib/main-wam/panitia/moderation";
import { samplePeople, sampleSessions } from "@/lib/main-wam/sample";
import type { MwSession } from "@/lib/main-wam/types";
import type { SentAnnouncement } from "./panitia/announce";

/*
 * Mode demo's sample for the panitia screens that name people (Moderasi, Absen sesi, Pengumuman). Used when
 * the data is empty, and always when the viewer is drawn as panitia without being panitia (a role's real
 * data is not theirs to read; sampleOnlyFor, src/lib/main-wam/demo.ts). Made-up names only.
 */

const uuid = (n: number) => `00000000-0000-4000-8700-${String(n).padStart(12, "0")}`;
const person = (key: string) => samplePeople[key].name;

/** Two photos waiting for a decision and one hidden (no picture: the card draws its own fill). */
export function demoModeration(now = new Date()): { reported: ModerationCard[]; hidden: ModerationCard[] } {
  const at = (minutes: number) => new Date(now.getTime() - minutes * 60_000).toISOString();
  const card = (n: number, owner: string, minutes: number, extra: Partial<ModerationCard>): ModerationCard => ({
    id: uuid(n), owner, createdAt: at(minutes), status: "tampil", reports: 1, reasons: [], notes: [], thumb: null, large: null, hiddenBy: null, hiddenAt: null, hiddenReason: "", ...extra,
  });
  return {
    reported: [
      card(1, person("hana"), 35, { status: "ditinjau", reports: 3, reasons: ["Tidak pantas · 2", "Data pribadi"], notes: ["Ada nomor kamar di meja."] }),
      card(2, person("gilang"), 80, { reports: 1, reasons: ["Tidak setuju"] }),
    ],
    hidden: [card(3, person("wawan"), 300, { status: "disembunyikan", reports: 3, reasons: ["Tidak pantas · 3"], hiddenBy: person("dimas"), hiddenAt: at(240), hiddenReason: "Tidak pantas" })],
  };
}

/** Pengumuman panitia sent earlier. */
export function demoSent(now = new Date()): SentAnnouncement[] {
  const sample = demoSample(sampleSessions, now);
  const team = sample.find(session => session.title === "Team building");
  const at = (minutes: number) => new Date(now.getTime() - minutes * 60_000).toISOString();
  return [
    { id: uuid(11), title: "Team building mulai 15.00 di Lawn", body: "Pakai kaos tim dan sepatu olahraga. Kumpul per kelompok di pos masing-masing.", at: at(90), by: person("dimas"), audience: "Semua peserta", pinnedUntil: team?.startsAt ?? null },
    { id: uuid(12), title: "Jalan ke Aula Utama lewat lobby timur", body: "Lift barat sedang dirawat.", at: at(1440 + 180), by: person("dimas"), audience: "Semua peserta", pinnedUntil: null },
  ];
}

/** The people of a sample session: everyone but BOD, with their check-in. */
export function demoAttendeeRows(sessionId: string): AttendeeRow[] {
  const byPerson = new Map(samplePresence(sessionId).map(row => [row.employeeId, row]));
  return Object.values(samplePeople).filter(item => item.department !== "BOD").map(item => {
    const check = byPerson.get(item.id);
    return { id: item.id, name: item.name, department: item.department, photo: null, checkedInAt: check?.checkedInAt ?? null, method: check?.method ?? null };
  });
}

/** The sample sessions that take attendance. */
export const demoAttendanceSessions = (now = new Date()): MwSession[] => demoSample(sampleSessions, now).filter(session => session.status === "terbit" && session.usesAttendance);
