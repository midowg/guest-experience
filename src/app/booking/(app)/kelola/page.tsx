import { Building2, CalendarCheck, DoorOpen, Handshake } from "lucide-react";
import { AdminSchedule } from "@/components/booking/AdminSchedule";
import css from "@/components/booking/booking.module.css";
import { officeDates } from "@/lib/booking/rules";
import { wibDate } from "@/lib/pra-wam/appraisal";
import { bookingPath } from "@/lib/routes";
import { officeBookingToEdit, officeDay, officeRange } from "@/lib/server/booking/bookings";
import { listPeople } from "@/lib/server/pra-wam/appraisal";
import { requireBookingPage } from "@/lib/server/booking/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Kelola" };

const shift = (date: string, days: number) => {
  const day = new Date(`${date}T12:00:00Z`);
  day.setUTCDate(day.getUTCDate() + days);
  return day.toISOString().slice(0, 10);
};
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Kelola → Ringkasan & jadwal: the numbers of the day and its week (Monday to Sunday), then every
 * room's day on the grid, where an empty half hour books for someone. ?edit opens a booking to change.
 */
export default async function ManageHome({ searchParams }: { searchParams: Promise<{ date?: string; edit?: string }> }) {
  const asked = await searchParams;
  const member = await requireBookingPage(bookingPath.manage(asked.date, asked.edit));
  const now = new Date();
  const today = wibDate(now.toISOString());
  const editing = asked.edit && /^[0-9a-f-]{36}$/.test(asked.edit) ? await officeBookingToEdit(asked.edit, member).catch(() => undefined) : undefined;
  const date = editing ? wibDate(editing.startsAt) : asked.date && DAY.test(asked.date) && !Number.isNaN(Date.parse(asked.date)) ? asked.date : today;
  const monday = shift(date, -((new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7));
  const [day, week, people] = await Promise.all([officeDay(date, member), officeRange(monday, shift(monday, 6), member), listPeople()]);
  const own = (items: typeof day.bookings) => items.filter(item => !item.isSession);
  const stats = [
    { label: "Booking hari ini", value: own(day.bookings).length, icon: <CalendarCheck size={20} aria-hidden /> },
    { label: "Ruangan terpakai", value: `${new Set(day.bookings.map(item => item.roomId)).size} / ${day.rooms.length}`, icon: <DoorOpen size={20} aria-hidden /> },
    { label: "Booking minggu ini", value: own(week.bookings).length, icon: <Building2 size={20} aria-hidden /> },
    { label: "Eksternal minggu ini", value: own(week.bookings).filter(item => item.audience === "eksternal").length, icon: <Handshake size={20} aria-hidden /> },
  ];
  return <>
    <dl className={css.stats}>{stats.map(stat => <div key={stat.label} className={css.stat}>
      <span className={css.statIcon}>{stat.icon}</span><div><dt>{stat.label}</dt><dd>{stat.value}</dd></div>
    </div>)}</dl>
    <AdminSchedule key={`${date}-${editing?.id ?? ""}`} date={date} today={today} dates={officeDates(today)} rooms={day.rooms} bookings={day.bookings}
      people={people.filter(person => person.active).map(({ id, name, fullName, department }) => ({ id, name, fullName, department }))}
      meId={member.id} now={now.toISOString()} editing={editing} />
  </>;
}
