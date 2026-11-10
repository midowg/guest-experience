import { notFound } from "next/navigation";
import { BookingFrame } from "@/components/booking/BookingFrame";
import { AccessAdmin } from "@/components/booking/AccessAdmin";
import { BookingForgot, BookingLogin, BookingNewPassword } from "@/components/booking/BookingAuth";
import css from "@/components/booking/booking.module.css";
import { AdminSchedule } from "@/components/booking/AdminSchedule";
import { BookingList } from "@/components/booking/BookingList";
import { RoomsAdmin } from "@/components/booking/RoomsAdmin";
import { RoomBoard } from "@/components/booking/RoomBoard";
import { officeDates, officeNeighbour, type OfficeBooking } from "@/lib/booking/rules";
import { wibDate, wibInstant, type Room } from "@/lib/pra-wam/appraisal";

export const dynamic = "force-dynamic";

const room = (id: string, name: string, capacity: number, minPeople: number | null, facilities: string[], departments: string[] = []): Room =>
  ({ id, slug: name.toLowerCase(), name, kind: "utama", capacity, bookable: true, minPeople, planKey: null, facilities, departments });
const rooms = [
  room("11111111-1111-4111-8111-111111111111", "CFC Ananta", 12, 3, ["TV", "Whiteboard", "Zoom"]),
  room("22222222-2222-4222-8222-222222222222", "Nagapadma", 6, null, ["TV", "AC"]),
  room("33333333-3333-4333-8333-333333333333", "Vasuki", 30, 8, ["Proyektor", "Sound system"], ["Sales & Marketing"]),
];
const me = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "Dita", fullName: "Dita Contoh", department: "GA" };
const people = [me, { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", name: "Pak Rama", fullName: "Rama Contoh", department: "BOD" }, { id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", name: "Sari", fullName: "Sari Contoh", department: "HR" }];

/**
 * Layout check for Booking Kantor with sample rooms and bookings, no sign-in. ?tampilan= daftar
 * (Kelola → Semua booking), kelola (Ringkasan & jadwal), ruangan (Kelola → Ruangan), akses (Kelola → Akses).
 * masuk, lupa, password (the sign-in pages, without signing anyone out). The Kelola tabs link to the
 * real pages, which need a sign-in.
 */
export default async function DevBookingPage({ searchParams }: { searchParams: Promise<{ tampilan?: string; new?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const search = await searchParams;
  const now = new Date();
  const today = wibDate(now.toISOString());
  const date = officeDates(today)[0];
  const at = (start: string, end: string) => ({ startsAt: wibInstant(date, start), endsAt: wibInstant(date, end) });
  const booking = (id: string, roomId: string, title: string, span: { startsAt: string; endsAt: string }, by: typeof me, extra: Partial<OfficeBooking> = {}): OfficeBooking =>
    ({ id, roomId, title, description: "", ...span, bookedBy: by, participants: [people[2]], source: "kantor", audience: "internal", externalNote: "", mine: by.id === me.id, ...extra });
  const bookings = [
    booking("d1", rooms[0].id, "Rapat mingguan GA", at("09:00", "10:30"), me),
    booking("d2", rooms[0].id, "Presentasi vendor katering", at("13:00", "15:00"), people[1], { audience: "eksternal", externalNote: "PT Contoh Boga", createdBy: "Dita Contoh" }),
    booking("d3", rooms[1].id, "Appraisal 1-on-1", at("08:00", "21:30"), people[2], { source: "wam" }),
    booking("d4", rooms[2].id, "Forum Pra WAM", at("10:00", "12:00"), people[1], { source: "wam", isSession: true, participants: null }),
  ];
  if (search.tampilan === "masuk") return <div className={css.app}><BookingLogin next={null} /></div>;
  if (search.tampilan === "lupa") return <div className={css.app}><BookingForgot /></div>;
  if (search.tampilan === "password") return <div className={css.app}><BookingNewPassword next="/booking" /></div>;
  return <BookingFrame name={me.name} canManage>
    {search.tampilan === "daftar"
      ? <><h1>Kelola booking</h1><BookingList manage bookings={bookings} rooms={rooms} empty="Tidak ada booking." /></>
      : search.tampilan === "kelola"
      ? <><h1>Kelola booking</h1><AdminSchedule date={date} today={today} dates={officeDates(today)} rooms={rooms} bookings={bookings} people={people} meId={me.id} now={now.toISOString()} /></>
      : search.tampilan === "ruangan"
      ? <><h1>Kelola booking</h1><RoomsAdmin rooms={[...rooms, { ...room("44444444-4444-4444-8444-444444444444", "Pantry", 10, null, []), bookable: false, kind: "area" }]} departments={["BOD", "GA", "HR", "Sales & Marketing"]} /></>
      : search.tampilan === "akses"
      ? <><h1>Kelola booking</h1><AccessAdmin meId={me.id} people={[
        { employeeId: me.id, name: "Dita Contoh", department: "GA", hasAccount: true, booking: true, wamAdmin: false },
        { employeeId: people[1].id, name: "Rama Contoh", department: "BOD", hasAccount: true, booking: false, wamAdmin: false },
        { employeeId: people[2].id, name: "Sari Contoh", department: "HR", hasAccount: false, booking: true, wamAdmin: false },
        { employeeId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", name: "Admin Contoh", department: "IT", hasAccount: true, booking: false, wamAdmin: true },
      ]} /></>
      : <RoomBoard date={date} today={today} dates={officeDates(today)} prev={officeNeighbour(date, today, -1)} next={officeNeighbour(date, today, 1)}
        rooms={rooms} bookings={bookings} people={people} meId={me.id} departments={["GA"]} now={now.toISOString()} openRoom={search.new} />}
  </BookingFrame>;
}
