import { RoomsAdmin } from "@/components/booking/RoomsAdmin";
import { bookingPath } from "@/lib/routes";
import { listPeople, listRooms } from "@/lib/server/pra-wam/appraisal";
import { requireBookingPage } from "@/lib/server/booking/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ruangan · Kelola" };

/** Kelola → Ruangan: every room, bookable or not, with the departments of Data karyawan to pick from. */
export default async function ManageRooms() {
  await requireBookingPage(bookingPath.manageRooms);
  const [rooms, people] = await Promise.all([listRooms(), listPeople()]);
  const departments = [...new Set(people.map(person => person.department.trim()).filter(Boolean))].sort();
  return <RoomsAdmin rooms={rooms} departments={departments} />;
}
