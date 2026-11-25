import type { AttendeeRow } from "@/lib/main-wam/panitia/attendance";
import type { TabletData } from "@/lib/main-wam/panitia/face-tablet";
import { attentionItems, kelolaTiles, runningSessions } from "@/lib/main-wam/panitia/attention";
import type { ModerationCard } from "@/lib/main-wam/panitia/moderation";
import { liveOfDay, type LiveSession } from "@/lib/main-wam/panitia/rundown";
import { checkInWindow, timeRange, wibDate } from "@/lib/main-wam/rundown";
import { sampleNotifications, samplePeople, sampleSession, sampleSessionIds, sampleSessions, sampleSessionsChanged, sampleSettings, sampleSilentQuestion } from "@/lib/main-wam/sample";
import type { MwSession } from "@/lib/main-wam/types";
import type { AnnounceData } from "@/lib/server/main-wam/panitia/announce";
import type { AttendanceData } from "@/lib/server/main-wam/panitia/attendance";
import type { RundownHistory } from "@/lib/server/main-wam/panitia/rundown";

/*
 * Area C's sample data for dev-preview (no sign-in, 404 in production), from the prototype (SPEC
 * §0.4, K01–K08, B01–B02) on top of fondasi's sample.ts. Every name is made up.
 */

const at = (date: string, time: string) => `${date}T${time}:00+07:00`;
const D1 = "2027-01-04", D2 = "2027-01-05", D3 = "2027-01-06";
const VERSION = "2027-01-05T00:00:00.000000+00:00";
const dimas = samplePeople.dimas;
export const modules = sampleSettings().modules;

/** The four day tabs, as the server makes them (links to the real addresses). */
export function sampleDays(today: number, link: (day: number) => string) {
  return ["Sen, 4 Jan", "Sel, 5 Jan", "Rab, 6 Jan", "Kam, 7 Jan"].map((date, index) => ({ key: String(index + 1), day: `Hari ${index + 1}`, date, today: index + 1 === today, href: link(index + 1) }));
}

/* ── K02 Rundown live ─────────────────────────────────────────────────────────────────────────── */

const live = (session: MwSession, silent: LiveSession["silent"] = null, changedBy: string | null = null): LiveSession => ({
  id: session.id, title: session.title, kind: session.kind, status: session.status, startsAt: session.startsAt, endsAt: session.endsAt, place: session.place,
  optional: session.optional, changedAt: changedBy ? session.changedAt : null, version: VERSION, changedByName: changedBy, silent,
});

/** Day 2 at 10.15 (K02): Batu Night Spectacular changed by Dimas at 08.05, Silent Meeting not open yet. */
export function rundownSessions(variant: "awal" | "disimpan" | "silent-dibuka" = "awal"): LiveSession[] {
  const base = variant === "awal" ? sampleSessions : sampleSessionsChanged();
  return liveOfDay(base, D2).map(session => {
    const silent = session.id === sampleSessionIds.silent
      ? { questionId: sampleSilentQuestion.id, state: variant === "silent-dibuka" ? "buka" as const : "belum" as const, count: null }
      : null;
    if (session.id === sampleSessionIds.bns) return live({ ...session, changedAt: at(D2, "08:05") }, silent, "Dimas");
    return live(session, silent, session.changedBy ? "Dimas" : null);
  });
}

export const rundownHistory: RundownHistory[] = [
  { id: "h1", title: "Pemaparan departemen", text: "Selesai 12.30, tadinya 12.00", by: "Dimas", at: at(D2, "10:20"), notified: true, recipients: 122 },
  { id: "h2", title: "Makan siang", text: "Jam 12.30–13.30, tadinya 12.00–13.00", by: "Dimas", at: at(D2, "10:20"), notified: true, recipients: 122 },
  { id: "h3", title: "Batu Night Spectacular", text: "Tempat Kumpul lobby 19.15, tadinya Lobby hotel", by: "Dimas", at: at(D2, "08:05"), notified: false, recipients: 0 },
];

/* ── K05 Absen sesi ───────────────────────────────────────────────────────────────────────────── */

const ABSENT: [key: string, group: number][] = [["bima", 4], ["tari", 4], ["wawan", 4], ["gilang", 1], ["putri", 9], ["hana", 7], ["yoga", 6], ["dewi", 3]];
const FILL_DEPARTMENTS = ["Sales & Marketing", "CoE", "HRGA", "Finance", "Art & Creative Support"];
const person = (key: string, group: number, extra: Partial<AttendeeRow> = {}): AttendeeRow => ({
  id: samplePeople[key].id, name: samplePeople[key].name, department: samplePeople[key].department, photo: null, checkedInAt: null, method: null, ...extra,
});

/** Pemaparan departemen at 10.15: 112 of 120 present (Rani by QR 07.52, Sari recorded 08.10), 8 not yet. */
export function attendanceRows(allPresent = false): AttendeeRow[] {
  const rows: AttendeeRow[] = [
    person("rani", 4, { checkedInAt: at(D2, "07:52"), method: "qr" }),
    person("sari", 4, { checkedInAt: at(D2, "08:10"), method: "manual" }),
    ...ABSENT.map(([key, group]) => person(key, group, allPresent ? { checkedInAt: at(D2, "08:20"), method: "manual" } : {})),
  ];
  for (let index = 1; rows.length < 120; index += 1) {
    const minute = String(30 + (index % 30)).padStart(2, "0");
    rows.push({ id: `00000000-0000-4000-8099-${String(index).padStart(12, "0")}`, name: `Zaki ${String(index).padStart(3, "0")}`, department: FILL_DEPARTMENTS[index % 5], photo: null, checkedInAt: at(D2, `07:${minute}`), method: "qr" });
  }
  return rows;
}

export function attendanceData(allPresent = false): AttendanceData {
  const pemaparan = sampleSession("pemaparan");
  const sessions = sampleSessions.filter(session => session.usesAttendance);
  return {
    migrated: true, now: at(D2, "10:15"), rows: attendanceRows(allPresent),
    sessions: sessions.map(session => ({ id: session.id, title: session.title, time: timeRange(session), day: ["Sen, 4 Jan", "Sel, 5 Jan", "Rab, 6 Jan", "Kam, 7 Jan"][["2027-01-04", "2027-01-05", "2027-01-06", "2027-01-07"].indexOf(wibDate(session.startsAt))], required: session.required })),
    session: { id: pemaparan.id, title: pemaparan.title, label: `${pemaparan.title} · ${timeRange(pemaparan)}`, caption: "Absen dibuka sampai 12.30", canRecord: true },
  };
}

/* ── K05b Absen mode tablet ──────────────────────────────────────────────────────────────────── */

/** The tablet's page at a moment: 54 of 120 in (the made-up Zaki rows past the 54th are still out), Bima not yet. */
export function tabletSample(clock: "buka" | "belum" | "tutup" = "buka", none = false): TabletData {
  const sessions = sampleSessions.filter(session => session.usesAttendance);
  const pemaparan = sampleSession("pemaparan");
  const rows = attendanceRows().map((row, index) => (index > 54 ? { ...row, checkedInAt: null, method: null } : row)).map(row => (row.name === "Bima" ? { ...row, checkedInAt: null, method: null } : row));
  return {
    migrated: true, enrolled: 96, now: at(D2, clock === "belum" ? "07:00" : clock === "tutup" ? "13:30" : "10:15"),
    sessions: none ? [] : sessions.map(session => ({
      id: session.id, title: session.title, time: timeRange(session), day: ["Sen, 4 Jan", "Sel, 5 Jan", "Rab, 6 Jan", "Kam, 7 Jan"][["2027-01-04", "2027-01-05", "2027-01-06", "2027-01-07"].indexOf(wibDate(session.startsAt))],
      required: session.required, ...checkInWindow(session),
    })),
    sessionId: none ? null : pemaparan.id, rows: none ? [] : rows,
  };
}

/* ── K06 Pengumuman ───────────────────────────────────────────────────────────────────────────── */

export const announceSample: AnnounceData = {
  migrated: true,
  counts: {
    semua: 122, panitia: 8,
    departments: [["Art & Creative Support", 18], ["BOD", 2], ["CoE", 30], ["Corporate", 8], ["Finance", 16], ["HRGA", 14], ["Sales & Marketing", 34]].map(([name, count]) => ({ name: name as string, count: count as number })),
  },
  sent: sampleNotifications.filter(note => note.kind === "pengumuman").map(note => ({ id: note.id, title: note.title, body: note.body, at: note.createdAt, by: "Dimas", audience: "Semua peserta", pinnedUntil: note.pinnedUntil })),
};

/* ── K08 Moderasi ─────────────────────────────────────────────────────────────────────────────── */

const card = (key: string, group: number, created: string, extra: Partial<ModerationCard>): ModerationCard => ({
  id: `00000000-0000-4000-8010-${String(Object.keys(samplePeople).indexOf(key) + 1).padStart(12, "0")}`, owner: samplePeople[key].name,
  createdAt: created, status: "tampil", reports: 1, reasons: [], notes: [], thumb: null, large: null, hiddenBy: null, hiddenAt: null, ...extra,
});
export const moderationReported: ModerationCard[] = [
  card("hana", 7, at(D2, "09:40"), { status: "ditinjau", reports: 3, reasons: ["Saya ada di foto ini dan tidak setuju · 2", "Tidak pantas atau menyinggung · 1"], notes: ["Tolong hapus, saya belum siap difoto."] }),
  card("putri", 9, at(D2, "09:12"), { reasons: ["Memperlihatkan data pribadi atau rahasia"] }),
  card("gilang", 1, at(D1, "20:15"), { reasons: ["Lainnya"], notes: ["Ada nomor kamar terlihat."] }),
];
export const moderationHidden: ModerationCard[] = [
  card("nina", 11, at(D2, "08:30"), { status: "disembunyikan", reports: 2, reasons: ["Tidak pantas atau menyinggung · 2"], hiddenBy: "Dimas", hiddenAt: at(D2, "09:05"), hiddenReason: "Tidak pantas" }),
];

/* ── K01 ──────────────────────────────────────────────────────────────────────────────── */

export const panitiaHome = {
  // The hub as the app draws it by default: Silent Meeting is off (Pra WAM's), so no row about it.
  tiles: kelolaTiles(modules, 3),
  running: runningSessions(sampleSessions, new Date(at(D2, "10:15"))),
  attention: attentionItems({ modules: { ...modules, silent: false }, reported: 3, required: [{ session: sampleSession("pemaparan"), present: 112, expected: 120 }], silent: [{ session: sampleSession("silent"), day: 2 }] }),
};

export const D3_BOD = at(D3, "16:00");
export { dimas };
