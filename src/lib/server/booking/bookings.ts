import "server-only";
import { clockLabel, dayLabel, wibDate, wibTime, type Booking, type Room } from "@/lib/pra-wam/appraisal";
import { bookingTopic } from "@/lib/pra-wam/push";
import { managesFacilities } from "@/lib/pra-wam/roles";
import type { Audience, OfficeBooking, OfficeBookingInput } from "@/lib/booking/rules";
import { ServiceError } from "../config";
import { notifyPeople } from "../pra-wam/announcements";
import { cancelBooking, daySchedule, getBooking, listRooms, myBookings, saveBooking, weekSchedule } from "../pra-wam/appraisal";
import type { Member } from "../pra-wam/session";
import { createPrivilegedClient } from "../supabase/admin";

/*
 * Booking Kantor (/booking): the office app's side of the room bookings. Everything that touches
 * a room goes through WAM's own functions (one set of rules, one database guard), so a booking
 * made here and one made in WAM can never take the same room. What is added here: where a booking
 * was made and who it is for (migration 202611100006), and telling the people invited, since an
 * office booking is not a WAM session.
 */

type Extra = { source: "wam" | "kantor"; audience: Audience; externalNote: string };
const NO_EXTRA: Extra = { source: "wam", audience: "internal", externalNote: "" };

/** Source and audience of some bookings; before migration 202611100006 every booking is WAM's and internal. */
async function extrasOf(ids: string[]): Promise<Map<string, Extra>> {
  const found = new Map<string, Extra>();
  if (!ids.length) return found;
  const { data, error } = await createPrivilegedClient().from("pw_room_bookings").select("id,source,audience,external_note").in("id", ids);
  if (error) return found;
  for (const row of data ?? []) found.set(row.id as string, { source: row.source === "kantor" ? "kantor" : "wam", audience: row.audience === "eksternal" ? "eksternal" : "internal", externalNote: (row.external_note as string | null) ?? "" });
  return found;
}

async function asOffice(bookings: Booking[], viewer: Member): Promise<OfficeBooking[]> {
  const extras = await extrasOf(bookings.filter(item => !item.isSession).map(item => item.id));
  // Who a guest is, like the description, is for the people in the booking and those who manage them.
  return bookings.map(item => {
    const extra = extras.get(item.id) ?? NO_EXTRA;
    return { ...item, ...extra, externalNote: item.participants ? extra.externalNote : "", mine: item.bookedBy.id === viewer.id };
  });
}

/** One day: the rooms that can be booked, and everything that holds them (WAM's bookings and sessions too). */
export async function officeDay(date: string, viewer: Member): Promise<{ rooms: Room[]; bookings: OfficeBooking[] }> {
  const { rooms, bookings } = await daySchedule(date, viewer);
  return { rooms: rooms.filter(room => room.bookable), bookings: await asOffice(bookings, viewer) };
}

/** Several days at once, for Kelola. */
export async function officeRange(from: string, to: string, viewer: Member): Promise<{ rooms: Room[]; bookings: OfficeBooking[] }> {
  const { rooms, bookings } = await weekSchedule([from, to], viewer);
  return { rooms: rooms.filter(room => room.bookable), bookings: await asOffice(bookings, viewer) };
}

/** The person's own bookings and the ones they are invited to, from today on, from both apps. */
export async function myOfficeBookings(viewer: Member, today: string): Promise<OfficeBooking[]> {
  return asOffice(await myBookings(viewer, today), viewer);
}

/** One of the person's own office bookings, to change it. A WAM booking is changed in WAM (it is also a session there). */
export async function officeBookingToEdit(id: string, viewer: Member): Promise<OfficeBooking> {
  const booking = await getBooking(id, viewer);
  const [office] = await asOffice([booking], viewer);
  if (!booking.mine) throw new ServiceError(403, "Hanya pemesan yang bisa mengubah booking ini.");
  if (office.source !== "kantor") throw new ServiceError(409, "Booking ini dibuat di WAM. Ubah dari aplikasi WAM.");
  return office;
}

const when = (booking: Pick<Booking, "startsAt" | "endsAt">) =>
  `${dayLabel(wibDate(booking.startsAt))}, ${clockLabel(wibTime(booking.startsAt))}–${clockLabel(wibTime(booking.endsAt))}`;

/** Tells the people invited (never whoever did it). The bell is WAM's, the one everyone already has. */
async function tell(booking: Booking, change: "terbit" | "berubah" | "batal", by: Member) {
  const people = [...(booking.participants ?? []).map(person => person.id), booking.bookedBy.id].filter(id => id && id !== by.id);
  if (!people.length) return;
  const room = (await listRooms()).find(item => item.id === booking.roomId)?.name ?? "Ruangan";
  const title = change === "terbit" ? `Kamu diajak: ${booking.title}` : change === "berubah" ? `Jadwal berubah: ${booking.title}` : `Dibatalkan: ${booking.title}`;
  await notifyPeople([...new Set(people)], { title, body: `${room} · ${when(booking)}`, label: "Booking Kantor", topic: bookingTopic(change, booking.startsAt, new Date()), tag: `booking-${booking.id}` }, by);
}

/** A new office booking, or a change to one of the person's own. The room rules and the overlap guard are WAM's. */
export async function saveOfficeBooking(input: OfficeBookingInput, viewer: Member, options: { id?: string; confirmed?: boolean; overCapacity?: boolean } = {}): Promise<Booking> {
  const before = options.id ? await officeBookingToEdit(options.id, viewer) : null;
  const saved = await saveBooking(input, viewer, { ...options, office: { audience: input.audience, externalNote: input.externalNote } });
  const moved = before && (before.startsAt !== saved.startsAt || before.endsAt !== saved.endsAt || before.roomId !== saved.roomId);
  if (!before || moved) await tell(saved, before ? "berubah" : "terbit", viewer);
  return saved;
}

/** The booker cancels their own; the administration staff cancel anyone's. The room is free at once. */
export async function cancelOfficeBooking(id: string, viewer: Member): Promise<void> {
  const [extra] = [...(await extrasOf([id])).values()];
  // A WAM booking is also a session there (and perhaps a Meeting HOD): WAM cancels it, with all that follows.
  if (extra?.source !== "kantor") throw new ServiceError(409, "Booking ini dibuat di WAM. Batalkan dari aplikasi WAM.");
  await tell(await cancelBooking(id, viewer), "batal", viewer);
}

export const requireFacilityManager = (viewer: Member) => {
  if (!managesFacilities(viewer)) throw new ServiceError(403, "Hanya bagian administrasi yang bisa membuka Kelola.");
};
