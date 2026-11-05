import type { ConsoleTone, TimelineBlock, TimelineRow } from "@/components/console";
import { clockLabel, dayLabel, wibDate, wibTime, type Booking, type Room } from "@/lib/pra-wam/appraisal";
import type { ScheduleRequest } from "@/lib/pra-wam/requests";
import { sessionKindLabels, sessionWhere, withoutSessionBookings, type RoomUse, type Session, type SessionKind } from "@/lib/pra-wam/sessions";

/*
 * Kelola acara's timelines and status lines (Ringkasan, Sesi, Permintaan, Peserta), worked out
 * from the data the pages already load. Pure, so it is tested without a server.
 */

/** A session's colour by its kind: a Pra WAM forum brass, a meeting green, an event teal. */
export const kindTones: Record<SessionKind, ConsoleTone> = { forum: "brass", rapat: "ok", acara: "teal" };
const ONE_ON_ONE = /\b1\s*-?\s*on\s*-?\s*1\b|one[\s-]*on[\s-]*one/i;
/** A room booking: appraisal blue, a one-on-one ("Appraisal 1-on-1") purple. */
export const bookingTone = (title: string): ConsoleTone => (ONE_ON_ONE.test(title) ? "purple" : "blue");

export type LegendItem = { label: string; tone: ConsoleTone };
/** What the colours mean; bookings only where they are drawn (a day by room). */
export function timelineLegend(withBookings: boolean): LegendItem[] {
  return [
    ...(withBookings ? [{ label: "Appraisal dan booking", tone: "blue" as const }, { label: "One-on-one", tone: "purple" as const }] : []),
    { label: "Sesi Pra WAM (forum)", tone: kindTones.forum },
    { label: sessionKindLabels.rapat, tone: kindTones.rapat },
    { label: sessionKindLabels.acara, tone: kindTones.acara },
    { label: "Draf", tone: "neutral" },
  ];
}

/** Where `iso` falls on `date` (WIB) in decimal hours: 0 when it is earlier, 24 when later. */
export function hoursOn(date: string, iso: string): number {
  const day = wibDate(iso);
  if (day < date) return 0;
  if (day > date) return 24;
  const [hours, minutes] = wibTime(iso).split(":").map(Number);
  return hours + minutes / 60;
}

/** Now as decimal WIB hours, for the timeline's red line. */
export const nowHours = (now: Date) => hoursOn(wibDate(now.toISOString()), now.toISOString());

/** The part of a span that falls on `date`, or null when none does. */
export function spanOn(date: string, startsAt: string, endsAt: string): { start: number; end: number } | null {
  const start = hoursOn(date, startsAt), end = hoursOn(date, endsAt);
  return end > start && start < 24 && end > 0 ? { start, end } : null;
}

const timeRange = (startsAt: string, endsAt: string) => `${clockLabel(wibTime(startsAt))}–${clockLabel(wibTime(endsAt))}`;

/** A session's block on `date`; a cancelled session or one without hours has none. */
export function sessionBlock(session: Session, date: string, href: string, sub?: string): TimelineBlock | null {
  if (session.status === "batal" || !session.startsAt || !session.endsAt) return null;
  const span = spanOn(date, session.startsAt, session.endsAt);
  if (!span) return null;
  return {
    key: `sesi-${session.id}`, title: session.title, ...span, href,
    sub: sub ?? `${session.booking ? `Booking ${session.booking.bookedBy.name}` : session.status === "draf" ? "Draf" : sessionKindLabels[session.kind]} · ${timeRange(session.startsAt, session.endsAt)}`,
    tone: session.status === "draf" ? "neutral" : kindTones[session.kind],
  };
}

/**
 * One day by room (Ringkasan, Sesi · Hari): each bookable room, and any room that holds something,
 * in the admin's order; then sessions held elsewhere (a written location), one row per place.
 * Bookings come from daySchedule; its copies of sessions are left out, the sessions themselves
 * (with their kind) are drawn instead. So is a booking that is a published session (migration
 * 202611050004): the room use is drawn once, as the session.
 */
export function roomRows({ date, rooms, bookings, sessions, sessionHref, bookingHref }: {
  date: string; rooms: readonly Room[]; bookings: readonly Booking[]; sessions: readonly Session[];
  sessionHref: (session: Session) => string; bookingHref: (booking: Booking) => string;
}): TimelineRow[] {
  const byRoom = new Map<string, TimelineBlock[]>();
  const elsewhere = new Map<string, TimelineBlock[]>();
  const add = (map: Map<string, TimelineBlock[]>, key: string, block: TimelineBlock) => map.set(key, [...(map.get(key) ?? []), block]);
  for (const session of sessions) {
    const block = sessionBlock(session, date, sessionHref(session));
    if (!block) continue;
    if (session.roomId) add(byRoom, session.roomId, block);
    else add(elsewhere, sessionWhere(session), block);
  }
  for (const booking of withoutSessionBookings(bookings, sessions)) {
    if (booking.isSession) continue;
    const span = spanOn(date, booking.startsAt, booking.endsAt);
    if (!span) continue;
    add(byRoom, booking.roomId, {
      key: `booking-${booking.id}`, title: booking.title, ...span, href: bookingHref(booking),
      sub: `${booking.bookedBy.name} · ${timeRange(booking.startsAt, booking.endsAt)}`, tone: bookingTone(booking.title),
    });
  }
  const sorted = (blocks: TimelineBlock[]) => [...blocks].sort((a, b) => a.start - b.start);
  return [
    ...rooms.filter(room => room.bookable || byRoom.has(room.id)).map(room => ({
      key: room.id, label: room.name, sub: room.capacity ? `${room.capacity} orang` : undefined, blocks: sorted(byRoom.get(room.id) ?? []),
    })),
    ...[...elsewhere].map(([place, blocks]) => ({ key: `tempat-${place}`, label: place, sub: "Di luar ruang booking", blocks: sorted(blocks) })),
  ];
}

/** A week by day (Sesi · Minggu): one row per date, its sessions placed by their hours. */
export function dayRows(dates: readonly string[], sessions: readonly Session[], sessionHref: (session: Session) => string, today?: string): TimelineRow[] {
  return dates.map(date => {
    const blocks = sessions.flatMap(session => {
      const block = sessionBlock(session, date, sessionHref(session), session.status === "draf" ? `Draf · ${sessionWhere(session)}` : sessionWhere(session));
      return block ? [block] : [];
    }).sort((a, b) => a.start - b.start);
    return { key: date, label: dayLabel(date), sub: date === today ? "Hari ini" : `${blocks.length} sesi`, blocks };
  });
}

/** The hours to draw: office hours, widened to whatever starts earlier or ends later. */
export function hourWindow(rows: readonly TimelineRow[], from = 8, to = 18): { from: number; to: number } {
  const blocks = rows.flatMap(row => row.blocks);
  const start = Math.min(from, ...blocks.map(block => Math.floor(block.start)));
  const end = Math.max(to, ...blocks.map(block => Math.ceil(block.end)));
  return { from: Math.max(0, start), to: Math.min(24, end) };
}

/** Where a session stands (Penpot's readiness pills), as a label and a tone. */
export function readiness(session: Pick<Session, "status" | "startsAt" | "endsAt" | "roomId" | "location">, now: Date): { label: string; tone: ConsoleTone } {
  if (session.status === "batal") return { label: "Batal", tone: "bad" };
  if (session.status === "draf") return { label: "Draf", tone: "neutral" };
  if (!session.roomId && !session.location) return { label: "Tempat belum ada", tone: "warn" };
  if (session.endsAt && new Date(session.endsAt) <= now) return { label: "Selesai absen", tone: "ok" };
  if (session.startsAt && new Date(session.startsAt) <= now) return { label: "Berlangsung", tone: "blue" };
  return { label: "Terjadwal", tone: "neutral" };
}

/** "Pra WAM hari ke-9" inside the Pra WAM dates, the phase's name otherwise. */
export function phaseDay(phase: { kind: string; name: string; startDate: string; endDate: string } | null, today: string): string | null {
  if (!phase) return null;
  if (phase.kind === "pra_wam" && phase.startDate <= today && today <= phase.endDate) {
    const day = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${phase.startDate}T00:00:00Z`)) / 86_400_000) + 1;
    return `Pra WAM hari ke-${day}`;
  }
  return phase.name;
}

export type RequestCheck = { tone: "ok" | "warn" | "neutral"; text: string };

/**
 * The line under a waiting request: has the session moved since, and is the room free at the asked
 * hours (`uses`: what holds rooms that day, roomUses). The server checks again when it is approved.
 */
export function requestCheck(request: Pick<ScheduleRequest, "sessionId" | "stillCurrent" | "toStartsAt" | "toEndsAt" | "toRoomId" | "toRoomName">,
  session: Pick<Session, "roomId" | "roomName" | "location"> | undefined, uses: readonly RoomUse[]): RequestCheck {
  if (!request.stillCurrent) return { tone: "warn", text: "Jadwal sesi sudah berubah sejak diajukan. Tolak dengan catatan." };
  const roomId = request.toRoomId ?? session?.roomId ?? null;
  const roomName = request.toRoomName ?? session?.roomName ?? "Ruang";
  if (!roomId) return { tone: "neutral", text: `Tanpa ruang booking${session?.location ? ` (${session.location})` : ""}, jadi tidak ada ruang yang perlu dicek.` };
  const clash = uses.find(use => use.roomId === roomId && use.sourceId !== request.sessionId
    && new Date(use.startsAt) < new Date(request.toEndsAt) && new Date(request.toStartsAt) < new Date(use.endsAt));
  if (clash) return { tone: "warn", text: `${roomName} dipakai ${clash.label}, ${timeRange(clash.startsAt, clash.endsAt)}. Persetujuan akan ditolak; tolak atau pindahkan sesi ke ruang lain.` };
  return { tone: "ok", text: `${roomName} kosong pada jam itu.` };
}

export type DayStatus = "hadir" | "belum" | "kosong";
export const dayStatusPill: Record<DayStatus, { label: string; tone: ConsoleTone }> = {
  hadir: { label: "Hadir", tone: "ok" }, belum: { label: "Belum absen", tone: "warn" }, kosong: { label: "Tidak ada sesi", tone: "neutral" },
};

/**
 * A person's day: present at one of today's sessions, expected but not checked in yet, or no
 * session today. `present` holds "sessionId:employeeId"; null when attendance is not recorded.
 */
export function dayStatus(personId: string, todays: readonly Pick<Session, "id" | "participants">[], present: ReadonlySet<string> | null): DayStatus {
  const theirs = todays.filter(session => (session.participants ?? []).some(person => person.id === personId));
  if (present && todays.some(session => present.has(`${session.id}:${personId}`))) return "hadir";
  return theirs.length ? "belum" : "kosong";
}

/** "Forum HC · Kam, 5 Nov 13.00": the person's next published session that has not started. */
export function nextSessionLabel(personId: string, sessions: readonly Session[], now: Date): string | null {
  const next = sessions
    .filter(session => session.status === "terbit" && session.startsAt && new Date(session.startsAt) > now && (session.participants ?? []).some(person => person.id === personId))
    .sort((a, b) => a.startsAt!.localeCompare(b.startsAt!))[0];
  if (!next?.startsAt) return null;
  const day = new Intl.DateTimeFormat("id-ID", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${wibDate(next.startsAt)}T12:00:00Z`));
  return `${next.title} · ${day} ${clockLabel(wibTime(next.startsAt))}`;
}

/** Adds a query to one of routes.ts's paths (a tab or a view of the same page). */
export function withQuery(path: string, query: Record<string, string | undefined>): string {
  const search = new URLSearchParams(Object.entries(query).filter((entry): entry is [string, string] => !!entry[1])).toString();
  return search ? `${path}?${search}` : path;
}
