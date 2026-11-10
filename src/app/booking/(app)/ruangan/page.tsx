import { RoomBoard } from "@/components/booking/RoomBoard";
import { officeDateOr, officeDates, officeNeighbour } from "@/lib/booking/rules";
import { wibDate } from "@/lib/pra-wam/appraisal";
import { bookingPath } from "@/lib/routes";
import { officeBookingToEdit, officeDay } from "@/lib/server/booking/bookings";
import { listPeople, memberDepartments } from "@/lib/server/pra-wam/appraisal";
import { requireBookingPage } from "@/lib/server/booking/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ruangan" };

type Search = { date?: string; new?: string; edit?: string; start?: string; menit?: string };

/**
 * Ruangan: every bookable room on one weekday, from today to 30 days ahead, for a start and a
 * length (?start=10:00&menit=60, else the next half hour and an hour). ?new and ?edit open the form.
 */
export default async function BookingRooms({ searchParams }: { searchParams: Promise<Search> }) {
  const search = await searchParams;
  const member = await requireBookingPage(bookingPath.rooms(search));
  const now = new Date();
  const today = wibDate(now.toISOString());
  const editing = search.edit && /^[0-9a-f-]{36}$/.test(search.edit) ? await officeBookingToEdit(search.edit, member).catch(() => undefined) : undefined;
  const date = editing ? wibDate(editing.startsAt) : officeDateOr(search.date, today);
  const [day, people, departments] = await Promise.all([officeDay(date, member), listPeople(), memberDepartments(member.id).catch(() => [])]);
  const minutes = Number(search.menit);
  return <RoomBoard key={`${date}-${editing?.id ?? search.new ?? ""}-${search.start ?? ""}-${search.menit ?? ""}`} date={date} today={today} dates={officeDates(today)}
    prev={officeNeighbour(date, today, -1)} next={officeNeighbour(date, today, 1)}
    rooms={day.rooms} bookings={day.bookings} meId={member.id} departments={departments} now={now.toISOString()}
    people={people.filter(person => person.active).map(({ id, name, fullName, department }) => ({ id, name, fullName, department }))}
    openRoom={search.new} editing={editing}
    askedStart={search.start && /^\d{2}:\d{2}$/.test(search.start) ? search.start : undefined} askedMinutes={Number.isFinite(minutes) && minutes > 0 ? minutes : undefined} />;
}
