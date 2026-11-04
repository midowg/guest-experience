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
