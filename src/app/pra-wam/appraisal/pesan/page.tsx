import { BookingForm, type BookingDraft } from "@/components/pra-wam/BookingForm";
import { PraWamShell } from "@/components/pra-wam/PraWamShell";
import { Notice } from "@/components/ui";
import { appraisalRules, bookableDates, slotTimes, wibDate, wibInstant, wibTime } from "@/lib/pra-wam/appraisal";
import { praWamPath } from "@/lib/routes";
import { ServiceError } from "@/lib/server/config";
import { daySchedule, getBooking, listPeople, usedTitles } from "@/lib/server/pra-wam/appraisal";
import { requireMemberPage, type Member } from "@/lib/server/pra-wam/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pesan ruang · Pra WAM", robots: { index: false } };

type Query = { ubah?: string; tanggal?: string; ruang?: string; mulai?: string };

/** The booking form, new or (with ?ubah=id) one of the person's own bookings. */
export default async function BookRoomPage({ searchParams }: { searchParams: Promise<Query> }) {
  const query = await searchParams;
  const member = await requireMemberPage(praWamPath.book(query));
  const now = new Date();
  const today = wibDate(now.toISOString());
  const dates = bookableDates(today);
  const loaded = await loadForm(query, member, now, today, dates).catch((error: unknown) => {
    if (error instanceof ServiceError) return error.message;
    throw error;
  });
  if (typeof loaded === "string") return <PraWamShell member={member} current="appraisal"><Notice tone="warning">{loaded}</Notice><p><a href={praWamPath.appraisal()}>Kembali ke jadwal ruang</a></p></PraWamShell>;
  const { editId, initial, schedule, people, titles } = loaded;
  const rooms = schedule.rooms.filter(room => room.bookable);
  return <PraWamShell member={member} current="appraisal">
    <BookingForm editId={editId} initial={initial} dates={dates.includes(initial.date) ? dates : [initial.date, ...dates]} now={now.toISOString()} rooms={rooms}
      people={people.filter(person => person.active).map(({ id, name, department }) => ({ id, name, department }))}
      viewer={{ id: member.id, department: member.department }} usedTitles={titles} dayBookings={schedule.bookings} />
  </PraWamShell>;
}

/** What the form starts with: the booking being changed, or the day, room and hour from the link. */
async function loadForm(query: Query, member: Member, now: Date, today: string, dates: string[]) {
  let initial: BookingDraft;
  const editId = query.ubah && /^[0-9a-f-]{36}$/.test(query.ubah) ? query.ubah : undefined;
  if (editId) {
    const booking = await getBooking(editId, member);
    if (!booking.mine) throw new ServiceError(403, "Hanya pemesan yang bisa mengubah booking ini.");
    initial = { date: wibDate(booking.startsAt), start: wibTime(booking.startsAt), end: wibTime(booking.endsAt), roomId: booking.roomId, title: booking.title, description: booking.description, participants: (booking.participants ?? []).map(person => person.id) };
  } else {
    const date = query.tanggal && dates.includes(query.tanggal) ? query.tanggal : dates[0] ?? today;
    const open = slotTimes().slice(0, -1).filter(time => new Date(wibInstant(date, time)) > now);
    const start = query.mulai && open.includes(query.mulai) ? query.mulai : open[0] ?? appraisalRules.open;
    const toMinutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
    const end = slotTimes().find(time => toMinutes(time) - toMinutes(start) >= 60) ?? appraisalRules.close;
    initial = { date, start, end, roomId: query.ruang ?? "", title: "", description: "", participants: [] };
  }
  const [schedule, people, titles] = await Promise.all([daySchedule(initial.date, member), listPeople(), usedTitles()]);
  if (!schedule.rooms.some(room => room.bookable && room.id === initial.roomId)) initial.roomId = "";
  return { editId, initial, schedule, people, titles };
}
