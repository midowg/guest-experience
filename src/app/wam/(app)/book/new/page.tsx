import { BookingForm, type BookingDraft } from "@/components/pra-wam/BookingForm";
import { ScreenHead } from "@/components/pra-wam/PraWamShell";
import { Notice } from "@/components/ui";
import { appraisalRules, bookableDates, dayLabel, draftHours, OUTSIDE_ROOM, wibDate, wibTime } from "@/lib/pra-wam/appraisal";
import { praWamPath } from "@/lib/routes";
import { ServiceError } from "@/lib/server/config";
import { daySchedule, getBooking, listPeople, usedTitles } from "@/lib/server/pra-wam/appraisal";
import { appraisalOpen } from "@/lib/server/pra-wam/events";
import { listUnits } from "@/lib/server/pra-wam/units";
import { participantGroups } from "@/lib/pra-wam/units";
import { requireMemberPage, type Member } from "@/lib/server/pra-wam/session";
import { timelineItems } from "@/lib/server/pra-wam/sessions";
import { bookingActivities } from "@/lib/pra-wam/timeline";

export const dynamic = "force-dynamic";
export const metadata = { title: "Book ruang · WAM", robots: { index: false } };

type Query = { edit?: string; date?: string; room?: string; start?: string; end?: string };

/**
 * The booking form as its own page, new or (with ?edit=id) one of the person's own bookings. Book
 * opens the same form in a sheet; this page stays for links that still point here.
 */
export default async function BookRoomPage({ searchParams }: { searchParams: Promise<Query> }) {
  const query = await searchParams;
  const member = await requireMemberPage(praWamPath.book(query));
  const now = new Date();
  const today = wibDate(now.toISOString());
  const dates = bookableDates(today);
  const top = (title: string) => <><ScreenHead eyebrow="Ruang meeting" title={title} /></>;
  if (!await appraisalOpen()) return <>{top("Book ruang")}<Notice tone="info">Book ruang sedang ditutup oleh admin WAM.</Notice></>;
  const loaded = await loadForm(query, member, now, today, dates).catch((error: unknown) => {
    if (error instanceof ServiceError) return error.message;
    throw error;
  });
  if (typeof loaded === "string") return <>{top("Book ruang")}<Notice tone="warning">{loaded}</Notice></>;
  const { editId, initial, schedule, people, titles, units, moved, activities } = loaded;
  // Every room: the plan draws the ones that cannot be booked in grey; the form offers the rest.
  const rooms = schedule.rooms;
  const active = people.filter(person => person.active).map(({ id, name, department }) => ({ id, name, department }));
  return <>
    {top(editId ? "Ubah booking" : "Book ruang")}
    {moved && <div style={{ marginBottom: 16 }}><Notice tone="info">{dayLabel(moved)} tidak bisa dibooking (sudah lewat atau di luar periode Book). Dipilih {dayLabel(initial.date)}; tanggalnya bisa diganti di bawah.</Notice></div>}
    <BookingForm editId={editId} initial={initial} dates={dates.includes(initial.date) ? dates : [initial.date, ...dates]} now={now.toISOString()} rooms={rooms}
      people={active} groups={participantGroups(active, member.id, units.units, units.memberships)}
      viewer={{ id: member.id }} usedTitles={titles} dayBookings={schedule.bookings} activities={activities} />
  </>;
}

/**
 * What the form starts with: the booking being changed, or the day, room and hours from the link.
 * Every day of Timeline's calendar links here (9 Nov 2026): a weekday from today opens on it, a
 * weekend from today opens on it as "Di luar kantor" (rooms are closed then), and a day that cannot
 * be booked (past, or outside the period) opens on the first bookable day, saying so (`moved`).
 */
async function loadForm(query: Query, member: Member, now: Date, today: string, dates: string[]) {
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
  const [schedule, people, titles, units, activities] = await Promise.all([daySchedule(initial.date, member), listPeople(), usedTitles(), listUnits(),
    timelineItems(member).then(result => bookingActivities(result.items, today)).catch(() => [])]);
  // An outside booking keeps its marker; a room no longer bookable is dropped.
  if (initial.roomId !== OUTSIDE_ROOM && !schedule.rooms.some(room => room.bookable && room.id === initial.roomId)) initial.roomId = "";
  return { editId, initial, schedule, people, titles, units, moved, activities };
}
