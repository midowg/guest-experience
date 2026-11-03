import { BookingForm, type BookingDraft } from "@/components/pra-wam/BookingForm";
import { PraWamShell, ScreenHead } from "@/components/pra-wam/PraWamShell";
import { Notice } from "@/components/ui";
import { appraisalRules, bookableDates, slotTimes, wibDate, wibInstant, wibTime } from "@/lib/pra-wam/appraisal";
import { praWamPath } from "@/lib/routes";
import { ServiceError } from "@/lib/server/config";
import { daySchedule, getBooking, listPeople, usedTitles } from "@/lib/server/pra-wam/appraisal";
import { appraisalOpen } from "@/lib/server/pra-wam/events";
import { listUnits } from "@/lib/server/pra-wam/units";
import { participantGroups } from "@/lib/pra-wam/units";
import { requireMemberPage, type Member } from "@/lib/server/pra-wam/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pesan ruang · WAM", robots: { index: false } };

type Query = { edit?: string; date?: string; room?: string; start?: string };

/** The booking form, new or (with ?ubah=id) one of the person's own bookings. */
export default async function BookRoomPage({ searchParams }: { searchParams: Promise<Query> }) {
  const query = await searchParams;
  const member = await requireMemberPage(praWamPath.book(query));
  const now = new Date();
  const today = wibDate(now.toISOString());
  const dates = bookableDates(today);
  const back = (title: string) => ({ href: praWamPath.appraisal(query.date), title });
  const top = (title: string) => <><ScreenHead eyebrow="Appraisal & 1-on-1" title={title} /></>;
  if (!await appraisalOpen()) return <PraWamShell member={member} current="appraisal" back={back("Pesan ruang")}>{top("Pesan ruang")}<Notice tone="info">Booking ruang appraisal sedang ditutup oleh admin WAM.</Notice></PraWamShell>;
  const loaded = await loadForm(query, member, now, today, dates).catch((error: unknown) => {
    if (error instanceof ServiceError) return error.message;
    throw error;
  });
  if (typeof loaded === "string") return <PraWamShell member={member} current="appraisal" back={back("Pesan ruang")}>{top("Pesan ruang")}<Notice tone="warning">{loaded}</Notice></PraWamShell>;
  const { editId, initial, schedule, people, titles, units } = loaded;
  const rooms = schedule.rooms.filter(room => room.bookable);
  const active = people.filter(person => person.active).map(({ id, name, department }) => ({ id, name, department }));
  return <PraWamShell member={member} current="appraisal" back={back(editId ? "Ubah booking" : "Pesan ruang")}>
    {top(editId ? "Ubah booking" : "Pesan ruang")}
    <BookingForm editId={editId} initial={initial} dates={dates.includes(initial.date) ? dates : [initial.date, ...dates]} now={now.toISOString()} rooms={rooms}
      people={active} groups={participantGroups(active, member.id, units.units, units.memberships)}
      viewer={{ id: member.id }} usedTitles={titles} dayBookings={schedule.bookings} />
  </PraWamShell>;
}

/** What the form starts with: the booking being changed, or the day, room and hour from the link. */
async function loadForm(query: Query, member: Member, now: Date, today: string, dates: string[]) {
  let initial: BookingDraft;
  const editId = query.edit && /^[0-9a-f-]{36}$/.test(query.edit) ? query.edit : undefined;
  if (editId) {
    const booking = await getBooking(editId, member);
    if (!booking.mine) throw new ServiceError(403, "Hanya pemesan yang bisa mengubah booking ini.");
    initial = { date: wibDate(booking.startsAt), start: wibTime(booking.startsAt), end: wibTime(booking.endsAt), roomId: booking.roomId, title: booking.title, description: booking.description, participants: (booking.participants ?? []).map(person => person.id) };
  } else {
    const date = query.date && dates.includes(query.date) ? query.date : dates[0] ?? today;
    const open = slotTimes().slice(0, -1).filter(time => new Date(wibInstant(date, time)) > now);
    const start = query.start && open.includes(query.start) ? query.start : open[0] ?? appraisalRules.open;
    const toMinutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
    const end = slotTimes().find(time => toMinutes(time) - toMinutes(start) >= 60) ?? appraisalRules.close;
    initial = { date, start, end, roomId: query.room ?? "", title: "", description: "", participants: [] };
  }
  const [schedule, people, titles, units] = await Promise.all([daySchedule(initial.date, member), listPeople(), usedTitles(), listUnits()]);
  if (!schedule.rooms.some(room => room.bookable && room.id === initial.roomId)) initial.roomId = "";
  return { editId, initial, schedule, people, titles, units };
}
