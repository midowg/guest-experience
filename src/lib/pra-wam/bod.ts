import type { AttendanceMethod } from "./attendance";

/*
 * Ringkasan Pra WAM for BOD (Penpot "B1", "E3"): the parts that are plain reasoning over numbers,
 * kept apart from the database so they can be tested. Nothing here invents a number: an item
 * appears only when the data behind it exists.
 */

export type ForumAttendance = { id: string; title: string; present: number; expected: number; live: boolean; startsAt: string };

/** Morning, day, afternoon or evening in WIB, for "Selamat pagi, Fadli". */
export function greeting(now: Date): string {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", timeZone: "Asia/Jakarta" }).format(now));
  if (hour < 11) return "Selamat pagi";
  if (hour < 15) return "Selamat siang";
  if (hour < 18) return "Selamat sore";
  return "Selamat malam";
}

/**
 * "Hadir di sesi aktif": the forum running now, else the one that started last. A forum still
 * to come is not counted (nobody is absent from it yet).
 */
export function activeForum(forums: ForumAttendance[]): ForumAttendance | null {
  return forums.find(forum => forum.live)
    ?? [...forums].sort((a, b) => b.startsAt.localeCompare(a.startsAt))[0]
    ?? null;
}

export const percent = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0);

/** A department is flagged when fewer than half of those invited to started forums came. */
export const lowAttendance = (unit: { present: number; expected: number }) => unit.expected > 0 && unit.present / unit.expected < 0.5;

export type AttentionKind = "low-attendance" | "requests" | "drafts" | "not-signed-in" | "deadline";
export type AttentionItem = { kind: AttentionKind; title: string; detail: string };

const longDay = (date: string) => new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
const names = (list: string[]) => list.length <= 3 ? list.join(", ") : `${list.slice(0, 3).join(", ")}, dan ${list.length - 3} lainnya`;

/**
 * "Perlu perhatian BOD": what deserves a look today, from real counts only. The final deadline
 * for reports and WAM material is the last day of Pra WAM (23 Des in the plan).
 */
export function attentionItems(input: {
  lowUnits: string[]; openRequests: number; drafts: number; notSignedIn: number;
  deadline: string | null; today: string;
}): AttentionItem[] {
  const items: AttentionItem[] = [];
  if (input.lowUnits.length) items.push({
    kind: "low-attendance", title: `${input.lowUnits.length} departemen hadir di bawah 50%`,
    detail: names(input.lowUnits),
  });
  if (input.openRequests > 0) items.push({
    kind: "requests", title: `${input.openRequests} permintaan jadwal menunggu panitia`,
    detail: "Panitia yang menjawab; kamu cukup memantau.",
  });
  if (input.drafts > 0) items.push({
    kind: "drafts", title: `${input.drafts} forum belum punya jam`,
    detail: "Masih draf; panitia sedang menjadwalkan.",
  });
  if (input.notSignedIn > 0) items.push({
    kind: "not-signed-in", title: `${input.notSignedIn} peserta belum pernah masuk`,
    detail: "Akun sudah dibuat, belum dipakai.",
  });
  if (input.deadline && input.deadline >= input.today) {
    const days = daysBetween(input.today, input.deadline);
    items.push({
      kind: "deadline", title: "Batas final laporan & materi WAM",
      detail: `${longDay(input.deadline)} · ${days === 0 ? "hari ini" : `${days} hari lagi`}`,
    });
  }
  return items;
}

export type AccountState = "aktif" | "belum-masuk" | "tanpa-akun" | "nonaktif";
export const accountLabels: Record<AccountState, string> = {
  aktif: "Akun aktif", "belum-masuk": "Belum pernah masuk", "tanpa-akun": "Belum punya akun", nonaktif: "Akun nonaktif",
};
export function accountState(account: { active: boolean; lastLoginAt: string | null } | null): AccountState {
  if (!account) return "tanpa-akun";
  if (!account.active) return "nonaktif";
  return account.lastLoginAt ? "aktif" : "belum-masuk";
}

/** One forum in a person's profile: came, missed (it ended), or running now without a check-in. */
export type ForumMark = "hadir" | "tidak-hadir" | "berlangsung";
export function forumMark(present: boolean, endsAt: string, now: Date): ForumMark {
  if (present) return "hadir";
  return new Date(endsAt) > now ? "berlangsung" : "tidak-hadir";
}

/** First and last name: "Fadli Fahmi Ali" -> "FA", as on the Penpot avatars. */
export function initials(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  return (words.length > 1 ? [words[0], words[words.length - 1]] : words).map(word => word[0]?.toUpperCase()).join("");
}

/*
 * Ringkasan BOD, the wider picture (6 Nov 2026): room use, how people check in, who uses the app
 * per department. Plain reasoning over rows the server already read, so it can be tested.
 */

const addDays = (date: string, days: number) => new Date(Date.parse(`${date}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
const weekday = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();

/** Monday to Friday of last week, this week and next week: the 15 office days around `today`. */
export function officeDaysAround(today: string): string[] {
  const day = weekday(today);
  const monday = addDays(today, day === 0 ? -6 : 1 - day);
  const days: string[] = [];
  for (let week = -1; week <= 1; week++) for (let offset = 0; offset < 5; offset++) days.push(addDays(monday, week * 7 + offset));
  return days;
}

type Use = { roomId: string; startsAt: string; endsAt: string; isSession?: boolean };
export type RoomDay = { date: string; bookings: number; sessions: number; hours: number };
export type RoomTotal = { id: string; name: string; uses: number; hours: number };
export type RoomUse = { days: RoomDay[]; rooms: RoomTotal[]; outside: number; total: number; hours: number };

const hoursOf = (use: Use) => Math.max(0, (Date.parse(use.endsAt) - Date.parse(use.startsAt)) / 3_600_000);
const round1 = (value: number) => Math.round(value * 10) / 10;

/**
 * Per office day how many bookings and sessions held a room and for how many hours, and per room
 * the total, busiest first. An outside booking has no room: it is counted apart.
 */
export function roomUse(uses: Use[], rooms: { id: string; name: string }[], days: string[], dateOf: (iso: string) => string, outsideId: string): RoomUse {
  const inOffice = uses.filter(use => use.roomId !== outsideId);
  const byDay = days.map(date => {
    const that = inOffice.filter(use => dateOf(use.startsAt) === date);
    return { date, bookings: that.filter(use => !use.isSession).length, sessions: that.filter(use => use.isSession).length, hours: round1(that.reduce((sum, use) => sum + hoursOf(use), 0)) };
  });
  const totals = rooms.map(room => {
    const that = inOffice.filter(use => use.roomId === room.id);
    return { id: room.id, name: room.name, uses: that.length, hours: round1(that.reduce((sum, use) => sum + hoursOf(use), 0)) };
  }).filter(room => room.uses > 0).sort((a, b) => b.hours - a.hours || b.uses - a.uses || a.name.localeCompare(b.name));
  return {
    days: byDay, rooms: totals, outside: uses.length - inOffice.length,
    total: inOffice.length, hours: round1(inOffice.reduce((sum, use) => sum + hoursOf(use), 0)),
  };
}

export type CheckInWay = AttendanceMethod;
/** How the check-ins were made, in a fixed order (the colours follow the way, never the rank). */
export function checkInMix(methods: (string | null)[]): { way: CheckInWay; count: number }[] {
  const ways: CheckInWay[] = ["qr", "offline", "online", "manual"];
  return ways.map(way => ({ way, count: methods.filter(method => (method ?? "qr") === way).length }));
}

export type Adoption = { name: string; people: number; accounts: number; signedIn: number };
/** Per department: people, how many have an account, how many have signed in; least used first. */
export function adoptionBy(groups: { name: string; members: string[] }[], accounts: Map<string, { signedIn: boolean }>): Adoption[] {
  return groups.map(group => {
    const own = group.members.map(id => accounts.get(id)).filter((account): account is { signedIn: boolean } => !!account);
    return { name: group.name, people: group.members.length, accounts: own.length, signedIn: own.filter(account => account.signedIn).length };
  }).filter(row => row.people > 0)
    .sort((a, b) => percent(a.signedIn, a.people) - percent(b.signedIn, b.people) || b.people - a.people || a.name.localeCompare(b.name));
}

/** Days from `today` to `date` (both YYYY-MM-DD, WIB); negative once it has passed. */
export const daysUntil = (today: string, date: string) => Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
