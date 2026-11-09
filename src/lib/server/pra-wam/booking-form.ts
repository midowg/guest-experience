import "server-only";
import type { BookingActivity, BookingDraft, PeopleGroup } from "@/components/pra-wam/BookingForm";
import { appraisalRules, bookableDates, draftHours, OUTSIDE_ROOM, wibDate, wibTime, type Booking, type Person, type Room } from "@/lib/pra-wam/appraisal";
import type { HodDepartment } from "@/lib/pra-wam/hod";
import { bookingActivities } from "@/lib/pra-wam/timeline";
import { participantGroups } from "@/lib/pra-wam/units";
import { ServiceError } from "../config";
import { daySchedule, getBooking, listPeople, usedTitles } from "./appraisal";
import { hodDepartments, hodStanding } from "./hod";
import { timelineItems } from "./sessions";
import type { Member } from "./session";
import { listUnits } from "./units";

export type BookingFormQuery = { edit?: string; date?: string; room?: string; start?: string; end?: string };

/** Everything the booking form needs, for its own page and for the booking sheet (GET /api/wam/book-form). */
export type BookingFormData = {
  editId?: string; initial: BookingDraft; dates: string[]; now: string;
  rooms: Room[]; dayBookings: Booking[]; dayOf: string;
  people: Person[]; groups: PeopleGroup[]; usedTitles: { title: string; count: number }[];
  activities: BookingActivity[]; hod: { departments: HodDepartment[]; ownUnits: string[] } | null;
  /** The day asked for when it could not be booked (past, outside the period); `initial.date` is the one offered instead. */
  moved: string | null;
};

/**
 * What the booking form starts with: the booking being changed, or the day, room and hours asked
 * for. Every day of Timeline's calendar can ask (9 Nov 2026): a weekday from today opens on it, a
 * weekend from today opens on it as "Di luar kantor" (rooms are closed then), and a day that cannot
 * be booked (past, or outside the period) opens on the first bookable day, saying so (`moved`).
 */
export async function bookingFormData(member: Member, query: BookingFormQuery, now = new Date()): Promise<BookingFormData> {
  const today = wibDate(now.toISOString());
  const dates = bookableDates(today);
  let initial: BookingDraft;
  let moved: string | null = null;
  const editId = query.edit && /^[0-9a-f-]{36}$/.test(query.edit) ? query.edit : undefined;
  if (editId) {
    const booking = await getBooking(editId, member);
    if (!booking.mine) throw new ServiceError(403, "Hanya pemesan yang bisa mengubah booking ini.");
    initial = { date: wibDate(booking.startsAt), start: wibTime(booking.startsAt), end: wibTime(booking.endsAt), roomId: booking.roomId, place: booking.place ?? "", title: booking.title, description: booking.description, participants: (booking.participants ?? []).map(person => person.id) };
  } else {
    const asked = query.date && /^\d{4}-\d{2}-\d{2}$/.test(query.date) ? query.date : null;
    const weekend = !!asked && !dates.includes(asked) && asked >= today && asked >= appraisalRules.periodStart && asked <= appraisalRules.periodEnd;
    const date = asked && (dates.includes(asked) || weekend) ? asked : dates[0] ?? today;
    if (asked && date !== asked) moved = asked;
    initial = { date, ...draftHours(date, now, query), roomId: weekend ? OUTSIDE_ROOM : query.room ?? "", title: "", description: "", participants: [] };
  }
  const [schedule, people, titles, units, activities, standing] = await Promise.all([
    daySchedule(initial.date, member), listPeople(), usedTitles(), listUnits(),
    timelineItems(member).then(result => bookingActivities(result.items, today)).catch(() => []),
    hodStanding(member).catch(() => null),
  ]);
  // An outside booking keeps its marker; a room no longer bookable is dropped.
  if (initial.roomId !== OUTSIDE_ROOM && !schedule.rooms.some(room => room.bookable && room.id === initial.roomId)) initial.roomId = "";
  const active = people.filter(person => person.active).map(({ id, name, department }) => ({ id, name, department }));
  const hod = standing?.isHod ? { departments: await hodDepartments().catch(() => []), ownUnits: standing.unitIds } : null;
  return {
    editId, initial, dates: dates.includes(initial.date) ? dates : [initial.date, ...dates], now: now.toISOString(),
    rooms: schedule.rooms, dayBookings: schedule.bookings, dayOf: initial.date,
    people: active, groups: participantGroups(active, member.id, units.units, units.memberships), usedTitles: titles,
    activities, hod: editId ? null : hod, moved,
  };
}
