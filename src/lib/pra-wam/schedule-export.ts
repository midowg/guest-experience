import { departmentShort } from "../employees";
import { clockLabel, dayLabel, wibDate, wibTime } from "./appraisal";
import type { Session } from "./sessions";

/*
 * Linimasa's export (10 Nov 2026): the published sessions of the week or day on screen, as PDF,
 * Excel, or a text to paste into WhatsApp, in the shape panitia already sends there:
 *
 *   meeting tanggal 10
 *   - Appraisal team SS | *CFC Ananta Room* | 11.00 - 12.30 (2 pax) & 13.30 - 15.00 (3 pax)
 *
 * The booker's department follows the name. One line per name and place on a day, its times joined with "&". Drafts and cancelled sessions
 * stay out, so is a session without hours. Pure, so it is tested without a server.
 */

/** Who booked, as "SM - Raja" (10 Nov 2026): the department's short form, then the call name. */
export const bookerLabel = (person: { name: string; department: string }) => {
  const department = departmentShort(person.department ?? "");
  return department ? `${department} - ${person.name}` : person.name;
};

export type ExportRange = "minggu" | "hari";
export type ExportSlot = { start: string; end: string; pax: number; booker: string | null };
export type ExportItem = { title: string; place: string; slots: ExportSlot[] };
export type ExportDay = { date: string; items: ExportItem[] };

const shift = (date: string, days: number) => { const day = new Date(`${date}T12:00:00Z`); day.setUTCDate(day.getUTCDate() + days); return day.toISOString().slice(0, 10); };
/** The dates exported: Monday to Sunday of the week holding `date`, or the day itself. */
export function exportDates(range: ExportRange, date: string): string[] {
  if (range === "hari") return [date];
  const monday = shift(date, -((new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7));
  return [0, 1, 2, 3, 4, 5, 6].map(days => shift(monday, days));
}

/** Where, as the text says it: the room, or "Di luar kantor (Lor Sawah)" for a booking outside. */
export function exportPlace(session: Pick<Session, "roomName" | "location" | "booking">): string {
  if (session.roomName) return session.roomName;
  if (session.location) return session.booking ? `Di luar kantor (${session.location})` : session.location;
  return "Tempat belum ditentukan";
}

/**
 * The name as the text says it (10 Nov 2026): the booker's department after it, "Appraisal team"
 * → "Appraisal team SM", unless the name already ends with it ("Appraisal team SM" stays).
 */
export function titleWithDepartment(title: string, department: string): string {
  const name = title.trim();
  const short = department.trim();
  if (!short) return name;
  const tail = name.split(/\s+/).at(-1)?.replace(/[()[\]]/g, "").toLowerCase();
  return tail === short.toLowerCase() || name.toLowerCase().endsWith(` ${short.toLowerCase()}`) ? name : `${name} ${short}`;
}

/** Each date that holds something, its sessions by name and place, earliest first. */
export function exportDays(sessions: readonly Session[], dates: readonly string[]): ExportDay[] {
  const wanted = new Set(dates);
  const byDay = new Map<string, Map<string, ExportItem & { first: string }>>();
  const shown = sessions
    .filter(session => session.status === "terbit" && session.startsAt && session.endsAt && wanted.has(wibDate(session.startsAt)))
    .sort((a, b) => a.startsAt!.localeCompare(b.startsAt!));
  for (const session of shown) {
    const date = wibDate(session.startsAt!);
    const place = exportPlace(session);
    const items = byDay.get(date) ?? new Map();
    const title = titleWithDepartment(session.title, session.booking ? departmentShort(session.booking.bookedBy.department ?? "") : "");
    const key = `${title.toLowerCase()}|${place.toLowerCase()}`;
    const item = items.get(key) ?? { title, place, slots: [], first: session.startsAt! };
    item.slots.push({
      start: clockLabel(wibTime(session.startsAt!)), end: clockLabel(wibTime(session.endsAt!)), pax: session.participantCount,
      booker: session.booking ? bookerLabel(session.booking.bookedBy) : null,
    });
    items.set(key, item);
    byDay.set(date, items);
  }
  return dates.filter(date => byDay.has(date)).map(date => ({
    date, items: [...byDay.get(date)!.values()].sort((a, b) => a.first.localeCompare(b.first)).map(({ title, place, slots }) => ({ title, place, slots })),
  }));
}

export const slotLabel = (slot: ExportSlot) => `${slot.start} - ${slot.end}${slot.pax ? ` (${slot.pax} pax)` : ""}`;
const dayNumber = (date: string) => String(Number(date.slice(8, 10)));
const monthShort = (date: string) => new Intl.DateTimeFormat("id-ID", { month: "short", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));

/** "10/11/2026 11.50 WIB" */
export function stampLabel(now: Date): string {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jakarta", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(now).map(part => [part.type, part.value]));
  return `${parts.day}/${parts.month}/${parts.year} ${parts.hour}.${parts.minute} WIB`;
}

/** "9 – 15 Nov 2026" for a week, "Selasa, 10 Nov 2026" for a day. */
export function rangeLabel(dates: readonly string[]): string {
  const first = dates[0], last = dates[dates.length - 1];
  if (!first) return "";
  if (first === last) return `${dayLabel(first)} ${first.slice(0, 4)}`;
  const sameMonth = first.slice(0, 7) === last.slice(0, 7);
  return `${dayNumber(first)}${sameMonth ? "" : ` ${monthShort(first)}`} – ${dayNumber(last)} ${monthShort(last)} ${last.slice(0, 4)}`;
}

/** The text for WhatsApp: one block per day, *room* in WhatsApp's bold, the time it was made. */
export function exportText(days: readonly ExportDay[], now: Date, dates: readonly string[]): string {
  const months = new Set(dates.map(date => date.slice(0, 7))).size;
  const blocks = days.map(day => [
    `meeting tanggal ${dayNumber(day.date)}${months > 1 ? ` ${monthShort(day.date)}` : ""}`,
    ...day.items.map(item => `- ${item.title} | *${item.place}* | ${item.slots.map(slotLabel).join(" & ")}`),
  ].join("\n"));
  const body = blocks.length ? blocks.join("\n\n") : `Belum ada meeting terbit ${rangeLabel(dates)}.`;
  return `${body}\n\nupdate per ${stampLabel(now)}`;
}

/** The Excel sheet: one row per time, with who booked it. */
export function exportRows(days: readonly ExportDay[]): string[][] {
  return [
    ["Tanggal", "Kegiatan", "Tempat", "Mulai", "Selesai", "Pax", "Pemesan"],
    ...days.flatMap(day => day.items.flatMap(item => item.slots.map(slot => [
      `${dayLabel(day.date)} ${day.date.slice(0, 4)}`, item.title, item.place, slot.start, slot.end, slot.pax ? String(slot.pax) : "", slot.booker ?? "",
    ]))),
  ];
}
