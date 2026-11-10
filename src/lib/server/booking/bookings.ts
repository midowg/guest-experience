import "server-only";
import { clockLabel, dayLabel, wibDate, wibTime, type Booking, type Room } from "@/lib/pra-wam/appraisal";
import { bookingTopic } from "@/lib/pra-wam/push";
import { managesFacilities } from "@/lib/pra-wam/roles";
import type { Audience, OfficeBooking, OfficeBookingInput } from "@/lib/booking/rules";
import { ServiceError } from "../config";
import { databaseError } from "../http";
import { notifyPeople } from "../pra-wam/announcements";
import { cancelBooking, daySchedule, getBooking, listPeople, listRooms, myBookings, saveBooking, weekSchedule } from "../pra-wam/appraisal";
import { rolesOf, type Member } from "../pra-wam/session";
import { createPrivilegedClient } from "../supabase/admin";

/*
 * Booking Kantor (/booking): the office app's side of the room bookings. Everything that touches
 * a room goes through WAM's own functions (one set of rules, one database guard), so a booking
 * made here and one made in WAM can never take the same room. What is added here: where a booking
 * was made, who it is for, and who made it for the booker (migration 202611100006); telling the
 * people invited, since an office booking is not a WAM session; and the administration staff's
 * part (Kelola): booking for someone, and cancelling anyone's with a reason.
 */

type Extra = { source: "wam" | "kantor"; audience: Audience; externalNote: string; createdById: string | null };
const NO_EXTRA: Extra = { source: "wam", audience: "internal", externalNote: "", createdById: null };

/** Source, audience and maker of some bookings; before migration 202611100006 every booking is WAM's, internal and made by its booker. */
async function extrasOf(ids: string[]): Promise<Map<string, Extra>> {
  const found = new Map<string, Extra>();
  if (!ids.length) return found;
  const { data, error } = await createPrivilegedClient().from("pw_room_bookings").select("id,source,audience,external_note,created_by").in("id", ids);
  if (error) return found;
  for (const row of data ?? []) found.set(row.id as string, {
    source: row.source === "kantor" ? "kantor" : "wam", audience: row.audience === "eksternal" ? "eksternal" : "internal",
    externalNote: (row.external_note as string | null) ?? "", createdById: (row.created_by as string | null) ?? null,
  });
  return found;
}

async function asOffice(bookings: Booking[], viewer: Member): Promise<OfficeBooking[]> {
  const extras = await extrasOf(bookings.filter(item => !item.isSession).map(item => item.id));
  const people = extras.size ? await listPeople() : [];
  // Who a guest is, like the description, is for the people in the booking and those who manage them.
  return bookings.map(item => {
    const { createdById, ...extra } = extras.get(item.id) ?? NO_EXTRA;
    const maker = createdById ? people.find(person => person.id === createdById) : undefined;
    return { ...item, ...extra, externalNote: item.participants ? extra.externalNote : "", mine: item.bookedBy.id === viewer.id, ...(maker ? { createdBy: maker.fullName } : {}) };
  });
}

/** One day: the rooms that can be booked, and everything that holds them (WAM's bookings and sessions too). */
export async function officeDay(date: string, viewer: Member): Promise<{ rooms: Room[]; bookings: OfficeBooking[] }> {
  const { rooms, bookings } = await daySchedule(date, viewer);
  return { rooms: rooms.filter(room => room.bookable), bookings: await asOffice(bookings, viewer) };
}

/** Several days at once (Kelola → Semua booking, at most six weeks), from `from` to `to`. */
export async function officeRange(from: string, to: string, viewer: Member): Promise<{ rooms: Room[]; bookings: OfficeBooking[] }> {
  const { rooms, bookings } = await weekSchedule([from, to], viewer);
  return { rooms, bookings: await asOffice(bookings, viewer) };
}

/** The person's own bookings and the ones they are invited to, from today on, from both apps. */
export async function myOfficeBookings(viewer: Member, today: string): Promise<OfficeBooking[]> {
  return asOffice(await myBookings(viewer, today), viewer);
}

export const requireFacilityManager = (viewer: Member) => {
  if (!managesFacilities(viewer)) throw new ServiceError(403, "Hanya bagian administrasi yang bisa membuka Kelola.");
};

/**
 * Someone the administration staff books for, as the booking code needs them: their own id,
 * department and roles, so the room rules (kept rooms, daily limit) are theirs, not the admin's.
 */
async function memberById(employeeId: string): Promise<Member> {
  const { data, error } = await createPrivilegedClient().from("employees").select("id,full_name,nickname,department,position,active").eq("id", employeeId).maybeSingle();
  if (error) databaseError(error);
  if (!data || !data.active) throw new ServiceError(422, "Karyawan ini tidak ditemukan atau sudah tidak aktif.", { forId: ["Pilih karyawan lain."] });
  return {
    id: data.id, name: data.full_name, nickname: data.nickname ?? "", department: data.department ?? "", position: data.position ?? "",
    mustChangePassword: false, roles: await rolesOf(data.id), photo: null,
  };
}

/**
 * The booking to change, with whose it is. The booker changes their own; the administration staff
 * change anyone's. A WAM booking is changed in WAM (it is also a session there).
 */
export async function officeBookingToEdit(id: string, viewer: Member): Promise<OfficeBooking> {
  const booking = await getBooking(id, viewer);
  const [office] = await asOffice([booking], viewer);
  if (!booking.mine && !managesFacilities(viewer)) throw new ServiceError(403, "Hanya pemesan atau bagian administrasi yang bisa mengubah booking ini.");
  if (office.source !== "kantor") throw new ServiceError(409, "Booking ini dibuat di WAM. Ubah dari aplikasi WAM.");
  return office;
}

const when = (booking: Pick<Booking, "startsAt" | "endsAt">) =>
  `${dayLabel(wibDate(booking.startsAt))}, ${clockLabel(wibTime(booking.startsAt))}–${clockLabel(wibTime(booking.endsAt))}`;

/** Tells the booker and the people invited (never whoever did it). The bell is WAM's, the one everyone already has. */
async function tell(booking: Booking, change: "terbit" | "berubah" | "batal", by: Member, note = "") {
  const people = [...(booking.participants ?? []).map(person => person.id), booking.bookedBy.id].filter(id => id && id !== by.id);
  if (!people.length) return;
  const room = (await listRooms()).find(item => item.id === booking.roomId)?.name ?? "Ruangan";
  const forYou = booking.bookedBy.id !== by.id;
  const title = change === "terbit" ? (forYou ? `Dibookingkan: ${booking.title}` : `Kamu diajak: ${booking.title}`)
    : change === "berubah" ? `Jadwal berubah: ${booking.title}` : `Dibatalkan: ${booking.title}`;
  const body = [`${room} · ${when(booking)}`, forYou ? `Oleh ${by.name}` : "", note].filter(Boolean).join("\n");
  await notifyPeople([...new Set(people)], { title, body, label: "Booking Kantor", topic: bookingTopic(change, booking.startsAt, new Date()), tag: `booking-${booking.id}` }, by);
}

/**
 * A new office booking, or a change to one. The room rules and the overlap guard are WAM's.
 * `forId`: the administration staff book for this person (they are the booker; the admin is
 * recorded as its maker). Changing someone else's booking keeps it theirs.
 */
export async function saveOfficeBooking(input: OfficeBookingInput, viewer: Member, options: { id?: string; confirmed?: boolean; overCapacity?: boolean; forId?: string } = {}): Promise<Booking> {
  const before = options.id ? await officeBookingToEdit(options.id, viewer) : null;
  const bookerId = before ? before.bookedBy.id : options.forId ?? viewer.id;
  if (bookerId !== viewer.id) requireFacilityManager(viewer);
  const booker = bookerId === viewer.id ? viewer : await memberById(bookerId);
  const saved = await saveBooking(input, booker, {
    id: options.id, confirmed: options.confirmed, overCapacity: options.overCapacity,
    office: { audience: input.audience, externalNote: input.externalNote, ...(booker.id !== viewer.id ? { createdBy: viewer.id } : {}) },
  });
  const moved = before && (before.startsAt !== saved.startsAt || before.endsAt !== saved.endsAt || before.roomId !== saved.roomId);
  if (!before || moved) await tell(saved, before ? "berubah" : "terbit", viewer);
  return saved;
}

/**
 * The booker cancels their own; the administration staff cancel anyone's, with a reason the booker
 * and the people invited read. The room is free at once.
 */
export async function cancelOfficeBooking(id: string, viewer: Member, reason = ""): Promise<void> {
  const [extra] = [...(await extrasOf([id])).values()];
  // A WAM booking is also a session there (and perhaps a Meeting HOD): WAM cancels it, with all that follows.
  if (extra?.source !== "kantor") throw new ServiceError(409, "Booking ini dibuat di WAM. Batalkan dari aplikasi WAM.");
  const booking = await getBooking(id, viewer);
  if (!booking.mine && !managesFacilities(viewer)) throw new ServiceError(403, "Hanya pemesan atau bagian administrasi yang bisa membatalkan booking ini.");
  if (!booking.mine && reason.trim().length < 3) throw new ServiceError(422, "Tulis alasan pembatalan untuk pemesan.", { reason: ["Tulis alasan pembatalan."] });
  await tell(await cancelBooking(id, viewer), "batal", viewer, reason.trim() ? `Alasan: ${reason.trim()}` : "");
}
