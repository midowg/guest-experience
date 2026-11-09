import { callName } from "@/lib/pra-wam/call-name";
import "server-only";
import { cache } from "react";
import { alternatives, appraisalRules, bookableDates, bookingProblems, clockLabel, OUTSIDE_ROOM, overCapacity, overlaps, roomFitProblem, wibInstant, wibTime, type Booking, type BookingInput, type Person, type Room } from "@/lib/pra-wam/appraisal";
import { daySummaries, type DaySummary } from "@/lib/pra-wam/room-day";
import { cancelsAnyBooking, seesAllParticipants } from "@/lib/pra-wam/roles";
import { ServiceError } from "../config";
import { databaseError } from "../http";
import { createPrivilegedClient } from "../supabase/admin";
import { deleteBookingAndSession, notifyBookingSession, withBookingLink } from "./booking-sessions";
import { seniorIds } from "./call-names";
import { appraisalOpen } from "./events";
import { notMigrated, waitingForMigration, type Member } from "./session";

/*
 * Appraisal room bookings. Anyone signed in books for themself; the database settles two people
 * reaching for the same room at once. Everyone sees who booked which room and for what; the
 * participants are only sent to the booker, the participants, and panitia, BOD and admin.
 * Since migration 202611050004 every active booking is also a published session (the database
 * keeps them in step); the schedules here still show it once, as the booking.
 * Since migration 202611050006 a booking may be "Di luar kantor": no room, a place name instead
 * (roomId OUTSIDE_ROOM here); before it, the place column is simply not read.
 */

type BookingRow = { id: string; room_id: string | null; place?: string | null; title: string; description: string; starts_at: string; ends_at: string; booked_by: string };
const bookingColumns = "id,room_id,title,description,starts_at,ends_at,booked_by";
const MIGRATION_OUTSIDE = "202611050006_pra_wam_booking_outside.sql";
/** The place column of migration 202611050006 is not there yet. */
const placeMissing = (error: { code?: string; message?: string } | null) => !!error && ["42703", "PGRST204"].includes(error.code ?? "") && /place/.test(error.message ?? "");
/** A bookings read with the place column, or without it before migration 202611050006. */
async function readBookings<T>(run: (columns: string) => PromiseLike<{ data: T | null; error: { code?: string; message: string } | null }>) {
  const first = await run(`${bookingColumns},place`);
  return placeMissing(first.error) ? run(bookingColumns) : first;
}
/** The room of a row: its id, or OUTSIDE_ROOM for a booking outside the office. */
const roomOf = (row: Pick<BookingRow, "room_id">) => row.room_id ?? OUTSIDE_ROOM;

/** A taken slot: what the person who lost the race sees, with somewhere else to go. */
export class BookingConflict extends ServiceError {
  constructor(message: string, public details: { kind: "room" | "participants"; sameRoom?: { start: string; end: string }[]; otherRooms?: string[]; people?: string[] }) {
    super(409, message);
    this.name = "BookingConflict";
  }
}

function fail(error: { code?: string; message: string }): never {
  if (notMigrated(error)) throw waitingForMigration();
  databaseError(error);
}

async function listRoomsUncached(): Promise<Room[]> {
  const client = createPrivilegedClient();
  const { data, error } = await client.from("pw_rooms").select("id,slug,name,kind,capacity,bookable,facilities,min_people,plan_key").order("sort_order");
  if (!error) return (data ?? []).map(({ min_people, plan_key, ...room }) => ({ ...room, minPeople: min_people, planKey: plan_key }) as Room);
  // Before migration 202611040009: no lower limit and no picked plan spot yet.
  if (error.code !== "42703" && error.code !== "PGRST204") fail(error);
  const { data: rows, error: oldError } = await client.from("pw_rooms").select("id,slug,name,kind,capacity,bookable,facilities").order("sort_order");
  if (oldError) fail(oldError);
  return (rows ?? []).map(room => ({ ...room, minPeople: null, planKey: null }) as Room);
}
/** Read once per request, however many parts of the page ask. */
export const listRooms = cache(listRoomsUncached);

/**
 * Everyone in Data karyawan, for names on the schedule and the participant picker. `name` is what
 * colleagues see (the nama panggilan, Pak or Bu for BOD, HOD and Lead); `fullName` stays for
 * admin views and for search.
 */
async function listPeopleUncached(): Promise<(Person & { fullName: string; active: boolean })[]> {
  const read = (fields: string) => createPrivilegedClient().from("employees").select(fields).order("department").order("full_name").limit(2000);
  let { data, error } = await read("id,full_name,nickname,gender,department,active");
  // Before migration 202611060007 there is no Jenis kelamin: the nama panggilan without Pak or Bu.
  if (error && ["42703", "PGRST204"].includes(error.code ?? "") && /gender/.test(error.message ?? "")) ({ data, error } = await read("id,full_name,nickname,department,active"));
  if (error) fail(error);
  const senior = await seniorIds();
  const rows = (data ?? []) as unknown as { id: string; full_name: string; nickname?: string | null; gender?: string | null; department: string; active: boolean }[];
  return rows.map(row => ({
    id: row.id, name: callName({ fullName: row.full_name, nickname: row.nickname, gender: row.gender }, senior.has(row.id)),
    fullName: row.full_name, department: row.department, active: row.active,
  }));
}
/** Read once per request, however many parts of the page ask. */
export const listPeople = cache(listPeopleUncached);

async function withPeople(rows: BookingRow[], viewer: Member): Promise<Booking[]> {
  if (!rows.length) return [];
  const client = createPrivilegedClient();
  const [people, { data: links, error }] = await Promise.all([
    listPeople(),
    client.from("pw_room_booking_participants").select("booking_id,employee_id").in("booking_id", rows.map(row => row.id)),
  ]);
  if (error) fail(error);
  const byId = new Map(people.map(person => [person.id, { id: person.id, name: person.name, fullName: person.fullName, department: person.department }]));
  const unknown = (id: string): Person => byId.get(id) ?? { id, name: "Tanpa nama", department: "" };
  const participants = new Map<string, string[]>();
  for (const link of links ?? []) participants.set(link.booking_id, [...(participants.get(link.booking_id) ?? []), link.employee_id]);
  return rows.map(row => {
    const ids = participants.get(row.id) ?? [];
    const involved = row.booked_by === viewer.id || ids.includes(viewer.id) || seesAllParticipants(viewer);
    return {
      id: row.id, roomId: roomOf(row), ...(row.place ? { place: row.place } : {}), title: row.title, description: involved ? row.description : "",
      startsAt: row.starts_at, endsAt: row.ends_at, bookedBy: unknown(row.booked_by),
      participants: involved ? ids.filter(id => id !== row.booked_by).map(unknown) : null,
    };
  });
}

/** From the start of `first` to the end of `last` (the same date for one day), in WIB. */
const dayRange = (first: string, last = first) => {
  const next = new Date(`${last}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return [wibInstant(first, "00:00"), wibInstant(next.toISOString().slice(0, 10), "00:00")] as const;
};

const activeOn = (date: string) => activeBetween(date, date);
async function activeBetween(first: string, last: string): Promise<BookingRow[]> {
  const [from, to] = dayRange(first, last);
  const { data, error } = await readBookings(columns => createPrivilegedClient().from("pw_room_bookings").select(columns)
    .eq("status", "aktif").gte("starts_at", from).lt("starts_at", to).order("starts_at"));
  if (error) fail(error);
  return (data ?? []) as unknown as BookingRow[];
}

/**
 * Sessions that hold a room on those days (migration 202611040004), as schedule entries. Nothing
 * before that migration. A booking's own session (202611050004) is left out: the booking itself
 * is on the schedule already, so the room use counts once.
 */
const sessionsOn = (date: string) => sessionsBetween(date, date);
async function sessionsBetween(first: string, last: string): Promise<Booking[]> {
  const [from, to] = dayRange(first, last);
  const client = createPrivilegedClient();
  const { data: holds, error } = await client.from("pw_room_holds").select("source_id,room_id,starts_at,ends_at").eq("source", "sesi").lt("starts_at", to).gt("ends_at", from);
  if (error || !holds?.length) return [];
  const { data } = await withBookingLink(withLink => client.from("pw_sessions").select(withLink ? "id,title,booking_id" : "id,title").in("id", holds.map(hold => hold.source_id)));
  const sessions = (data ?? []) as unknown as { id: string; title: string; booking_id?: string | null }[];
  const fromBookings = new Set(sessions.filter(item => item.booking_id).map(item => item.id));
  return holds.filter(hold => !fromBookings.has(hold.source_id)).map(hold => ({
    id: `sesi:${hold.source_id}`, roomId: hold.room_id, title: sessions.find(item => item.id === hold.source_id)?.title ?? "Sesi Pra WAM", description: "",
    startsAt: hold.starts_at, endsAt: hold.ends_at, bookedBy: { id: "", name: "Panitia Pra WAM", department: "" }, participants: null, isSession: true,
  }));
}

/** One day's schedule: every room, every active booking, and the sessions that hold a room. */
export async function daySchedule(date: string, viewer: Member): Promise<{ rooms: Room[]; bookings: Booking[] }> {
  const [rooms, rows, sessions] = await Promise.all([listRooms(), activeOn(date), sessionsOn(date)]);
  return { rooms, bookings: [...await withPeople(rows, viewer), ...sessions].sort((a, b) => a.startsAt.localeCompare(b.startsAt)) };
}

/** The schedule of several days at once (the Book calendar's week, `dates` in order), as daySchedule. */
export async function weekSchedule(dates: string[], viewer: Member): Promise<{ rooms: Room[]; bookings: Booking[] }> {
  const first = dates[0], last = dates.at(-1) ?? first;
  const [rooms, rows, sessions] = await Promise.all([listRooms(), activeBetween(first, last), sessionsBetween(first, last)]);
  return { rooms, bookings: [...await withPeople(rows, viewer), ...sessions].sort((a, b) => a.startsAt.localeCompare(b.startsAt)) };
}

/**
 * A light summary of every weekday from `from` to `to` (the date strip on Book): per date how many
 * bookings and Pra WAM sessions the bookable rooms have, and whether all of them are full
 * (daySummaries). Read only; no names or titles leave the server.
 */
export async function windowSummary(from: string, to: string, now = new Date()): Promise<Record<string, DaySummary>> {
  const [rooms, rows, sessions] = await Promise.all([listRooms(), activeBetween(from, to), sessionsBetween(from, to)]);
  const holds = [
    ...rows.map(row => ({ roomId: roomOf(row), startsAt: row.starts_at, endsAt: row.ends_at })),
    ...sessions.map(item => ({ roomId: item.roomId, startsAt: item.startsAt, endsAt: item.endsAt, session: true })),
  ];
  return daySummaries(bookableDates(from).filter(date => date <= to), rooms, holds, now);
}

/**
 * Bookings the person made or takes part in, from today on. `status` "batal" (9 Nov 2026): the
 * cancelled ones instead, shown greyed in Agenda (and no longer on Beranda).
 */
export async function myBookings(viewer: Member, today: string, status: "aktif" | "batal" = "aktif"): Promise<Booking[]> {
  const client = createPrivilegedClient();
  const { data: links, error: linkError } = await client.from("pw_room_booking_participants").select("booking_id").eq("employee_id", viewer.id).limit(500);
  if (linkError) fail(linkError);
  const ids = (links ?? []).map(link => link.booking_id);
  const { data, error } = await readBookings(columns => {
    const query = client.from("pw_room_bookings").select(columns).eq("status", status).gte("starts_at", wibInstant(today, "00:00"));
    return (ids.length ? query.or(`booked_by.eq.${viewer.id},id.in.(${ids.join(",")})`) : query.eq("booked_by", viewer.id)).order("starts_at").limit(200);
  });
  if (error) fail(error);
  return withPeople((data ?? []) as unknown as BookingRow[], viewer);
}

/** Activity names already used, with how often, for the suggestions. */
export async function usedTitles(): Promise<{ title: string; count: number }[]> {
  const { data, error } = await createPrivilegedClient().from("pw_room_bookings").select("title").order("created_at", { ascending: false }).limit(1000);
  if (error) fail(error);
  const counts = new Map<string, { title: string; count: number }>();
  for (const { title } of data ?? []) {
    const key = title.trim().toLowerCase();
    counts.set(key, { title: counts.get(key)?.title ?? title.trim(), count: (counts.get(key)?.count ?? 0) + 1 });
  }
  return [...counts.values()];
}

export async function getBooking(id: string, viewer: Member): Promise<Booking & { mine: boolean; booker: string }> {
  const { data, error } = await readBookings(columns => createPrivilegedClient().from("pw_room_bookings").select(columns).eq("id", id).eq("status", "aktif").maybeSingle());
  if (error) fail(error);
  if (!data) throw new ServiceError(404, "Booking tidak ditemukan atau sudah dibatalkan.");
  const row = data as unknown as BookingRow;
  const [booking] = await withPeople([row], viewer);
  return { ...booking, mine: row.booked_by === viewer.id, booker: row.booked_by };
}

async function requireOwn(id: string, viewer: Member) {
  const booking = await getBooking(id, viewer);
  if (!booking.mine) throw new ServiceError(403, "Hanya pemesan yang bisa mengubah atau membatalkan booking ini.");
  return booking;
}

/**
 * Saves a new booking or changes one of the viewer's own. The rules are checked here with the
 * server's clock; the database checks them again and refuses an overlap. A participant who is
 * already booked elsewhere at that time is a warning the person confirms (`confirmed`).
 */
export async function saveBooking(input: BookingInput, viewer: Member, options: { id?: string; confirmed?: boolean; overCapacity?: boolean; now?: Date; quiet?: boolean } = {}): Promise<Booking> {
  const now = options.now ?? new Date();
  if (!await appraisalOpen()) throw new ServiceError(409, "Booking ruang appraisal sedang ditutup oleh admin Pra WAM.");
  const before = options.id ? await requireOwn(options.id, viewer) : null;
  const problems = bookingProblems(input, now);
  if (Object.keys(problems).length) throw new ServiceError(422, "Periksa kembali tanggal dan jam.", Object.fromEntries(Object.entries(problems).map(([key, message]) => [key, [message]])));
  // The room must suit how many come (the same rule the form uses): no one-on-one in the big room.
  const rooms = await listRooms();
  const unfit = roomFitProblem(rooms, input, viewer.id);
  if (unfit) throw new ServiceError(422, unfit.message, { roomId: [unfit.reason] });
  // The largest room may hold more than its capacity, only once the booker says yes.
  const over = overCapacity(rooms, input, viewer.id);
  if (over && !options.overCapacity) {
    const message = `${over.room} muat ${over.capacity} orang, yang ikut ${over.people}. Centang "Ya, saya yakin" lalu simpan lagi.`;
    throw new ServiceError(422, message, { overCapacity: [message] });
  }
  const span = { startsAt: wibInstant(input.date, input.start), endsAt: wibInstant(input.date, input.end) };
  const participants = [...new Set(input.participants)].filter(id => id !== viewer.id);
  const sameDay = await activeOn(input.date);

  if (!options.confirmed && participants.length) {
    const clashing = sameDay.filter(row => row.id !== options.id && overlaps({ startsAt: row.starts_at, endsAt: row.ends_at }, span));
    if (clashing.length) {
      const { data: links, error } = await createPrivilegedClient().from("pw_room_booking_participants").select("employee_id").in("booking_id", clashing.map(row => row.id)).in("employee_id", participants);
      if (error) fail(error);
      const busy = [...new Set((links ?? []).map(link => link.employee_id))];
      if (busy.length) {
        const people = new Map((await listPeople()).map(person => [person.id, person.name]));
        const names = busy.map(id => people.get(id) ?? "Tanpa nama");
        throw new BookingConflict(`${names.join(", ")} sudah ada di booking lain pada jam itu.`, { kind: "participants", people: names });
      }
    }
  }

  // Outside the office: no room, the place instead (only sent then, so room bookings work before 202611050006).
  const outside = input.roomId === OUTSIDE_ROOM;
  const { data, error } = await createPrivilegedClient().rpc("pw_save_booking", {
    p_id: options.id ?? null, p_room: outside ? null : input.roomId, p_title: input.title, p_description: input.description,
    p_starts: span.startsAt, p_ends: span.endsAt, p_booked_by: viewer.id, p_participants: participants, p_max_per_day: appraisalRules.maxPerDay,
    ...(outside ? { p_place: input.place } : {}),
  });
  if (error) {
    if (outside && (error.code === "PGRST202" || /p_place|place/.test(error.message))) throw new ServiceError(503, `Booking di luar kantor menunggu migrasi ${MIGRATION_OUTSIDE}. Sementara itu pilih ruang kantor.`);
    if (/PLACE_MISSING/.test(error.message)) throw new ServiceError(422, "Isi nama tempat.", { place: ["Isi nama tempat."] });
    if (error.code === "23P01") throw await roomTaken(input, viewer, now, options.id);
    if (/ROOM_NOT_BOOKABLE/.test(error.message)) throw new ServiceError(422, "Ruang ini tidak bisa dipesan untuk appraisal.", { roomId: ["Pilih ruang lain."] });
    if (/BOOKING_DAILY_LIMIT/.test(error.message)) throw new ServiceError(409, `Kamu sudah punya ${appraisalRules.maxPerDay} booking aktif pada hari itu. Batalkan salah satu dulu.`);
    if (/NOT_FOUND/.test(error.message)) throw new ServiceError(404, "Booking tidak ditemukan atau sudah dibatalkan.");
    if (error.code === "23514") throw new ServiceError(422, outside ? "Tanggal atau jam tidak bisa disimpan. Booking di luar kantor harus dalam satu hari." : `Jam di luar ${clockLabel(appraisalRules.open)}–${clockLabel(appraisalRules.close)} Senin–Jumat, atau lebih dari 4 jam.`);
    if (error.code === "23503") throw new ServiceError(422, "Ada partisipan atau ruang yang tidak dikenal. Muat ulang halaman.");
    fail(error);
  }
  const saved = await getBooking(data as string, viewer);
  // Its session was saved with it (same transaction); the people in it hear as for any session.
  const moved = before && (before.startsAt !== saved.startsAt || before.endsAt !== saved.endsAt || before.roomId !== saved.roomId);
  // A booking made as HOD tells its HODs itself, with Terima and Tolak (hod.ts), not twice.
  if (!options.quiet && (!before || moved)) await notifyBookingSession(saved.id, before ? "berubah" : "terbit", await bookingFacts(saved), viewer);
  return saved;
}

/** What a note about a booking's session says. */
const bookingFacts = async (booking: Booking) => ({
  title: booking.title, startsAt: booking.startsAt, endsAt: booking.endsAt,
  roomName: booking.place ? `${booking.place} (di luar kantor)` : (await listRooms()).find(room => room.id === booking.roomId)?.name ?? null,
});

/** The second person to save gets who took the room, and the nearest free options. */
async function roomTaken(input: BookingInput, viewer: Member, now: Date, ignoreId?: string): Promise<BookingConflict> {
  const [rooms, rows, sessions] = await Promise.all([listRooms(), activeOn(input.date), sessionsOn(input.date)]);
  const span = { startsAt: wibInstant(input.date, input.start), endsAt: wibInstant(input.date, input.end) };
  const taker = rows.find(row => row.id !== ignoreId && row.room_id === input.roomId && overlaps({ startsAt: row.starts_at, endsAt: row.ends_at }, span));
  const session = sessions.find(item => item.roomId === input.roomId && overlaps(item, span));
  const room = rooms.find(item => item.id === input.roomId)?.name ?? "Ruang ini";
  const name = taker ? (await listPeople()).find(person => person.id === taker.booked_by)?.name : undefined;
  const options = alternatives(input, rooms, [...rows.map(row => ({ id: row.id, roomId: roomOf(row), startsAt: row.starts_at, endsAt: row.ends_at })), ...sessions], now, ignoreId);
  const message = !taker && session
    ? `${room} dipakai sesi ${session.title}, ${clockLabel(wibTime(session.startsAt))}–${clockLabel(wibTime(session.endsAt))}.`
    : taker && name
    ? `${room} baru saja dipesan ${taker.booked_by === viewer.id ? "olehmu" : name}, ${clockLabel(wibTime(taker.starts_at))}–${clockLabel(wibTime(taker.ends_at))}.`
    : `${room} sudah terpakai pada jam itu.`;
  return new BookingConflict(message, { kind: "room", ...options });
}

/** The booker cancels their own; panitia and admin may cancel anyone's (cancelled_by records who). */
/** Cancels a booking and returns it as it was (its room, or outside the office, words the reply). */
export async function cancelBooking(id: string, viewer: Member): Promise<Booking> {
  const booking = await getBooking(id, viewer);
  if (!booking.mine && !cancelsAnyBooking(viewer)) throw new ServiceError(403, "Hanya pemesan atau panitia yang bisa membatalkan booking ini.");
  const { error } = await createPrivilegedClient().from("pw_room_bookings")
    .update({ status: "batal", cancelled_by: viewer.id, cancelled_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", id).eq("status", "aktif");
  if (error) fail(error);
  // Its session was cancelled with it (trigger); its people hear, except whoever cancelled.
  await notifyBookingSession(id, "batal", await bookingFacts(booking), viewer);
  return booking;
}

/**
 * Removes a booking for good (a test or a mistake), not just cancels it: the booker, panitia or
 * admin. The room hold goes with it (trigger), so the slot is free at once, and so does its
 * session with that session's documents and notifications.
 */
export async function deleteBooking(id: string, viewer: Member): Promise<void> {
  const client = createPrivilegedClient();
  const { data, error } = await client.from("pw_room_bookings").select("booked_by").eq("id", id).maybeSingle();
  if (error) fail(error);
  if (!data) throw new ServiceError(404, "Booking tidak ditemukan.");
  if (data.booked_by !== viewer.id && !cancelsAnyBooking(viewer)) throw new ServiceError(403, "Hanya pemesan atau panitia yang bisa menghapus booking ini.");
  const deleteError = await deleteBookingAndSession(id);
  if (deleteError) fail(deleteError);
}

/** What colleagues see for one person (the nama panggilan, with Pak or Bu where it applies). */
export async function callNameOf(employeeId: string, fallback: string): Promise<string> {
  return (await listPeople()).find(person => person.id === employeeId)?.name ?? fallback;
}
