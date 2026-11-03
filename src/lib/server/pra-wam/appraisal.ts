import "server-only";
import { alternatives, appraisalRules, bookingProblems, clockLabel, overlaps, wibInstant, wibTime, type Booking, type BookingInput, type Person, type Room } from "@/lib/pra-wam/appraisal";
import { cancelsAnyBooking, seesAllParticipants } from "@/lib/pra-wam/roles";
import { ServiceError } from "../config";
import { databaseError } from "../http";
import { createPrivilegedClient } from "../supabase/admin";
import { appraisalOpen } from "./events";
import { notMigrated, waitingForMigration, type Member } from "./session";

/*
 * Appraisal room bookings. Anyone signed in books for themself; the database settles two people
 * reaching for the same room at once. Everyone sees who booked which room and for what; the
 * participants are only sent to the booker, the participants, and panitia, BOD and admin.
 */

type BookingRow = { id: string; room_id: string; title: string; description: string; starts_at: string; ends_at: string; booked_by: string };
const bookingColumns = "id,room_id,title,description,starts_at,ends_at,booked_by";

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

export async function listRooms(): Promise<Room[]> {
  const { data, error } = await createPrivilegedClient().from("pw_rooms").select("id,slug,name,kind,capacity,bookable").order("sort_order");
  if (error) fail(error);
  return (data ?? []) as Room[];
}

/** Everyone in Data karyawan, for names on the schedule and the participant picker. */
export async function listPeople(): Promise<(Person & { active: boolean })[]> {
  const { data, error } = await createPrivilegedClient().from("employees").select("id,full_name,department,active").order("department").order("full_name").limit(2000);
  if (error) fail(error);
  return (data ?? []).map(row => ({ id: row.id, name: row.full_name, department: row.department, active: row.active }));
}

async function withPeople(rows: BookingRow[], viewer: Member): Promise<Booking[]> {
  if (!rows.length) return [];
  const client = createPrivilegedClient();
  const [people, { data: links, error }] = await Promise.all([
    listPeople(),
    client.from("pw_room_booking_participants").select("booking_id,employee_id").in("booking_id", rows.map(row => row.id)),
  ]);
  if (error) fail(error);
  const byId = new Map(people.map(person => [person.id, { id: person.id, name: person.name, department: person.department }]));
  const unknown = (id: string): Person => byId.get(id) ?? { id, name: "Tanpa nama", department: "" };
  const participants = new Map<string, string[]>();
  for (const link of links ?? []) participants.set(link.booking_id, [...(participants.get(link.booking_id) ?? []), link.employee_id]);
  return rows.map(row => {
    const ids = participants.get(row.id) ?? [];
    const involved = row.booked_by === viewer.id || ids.includes(viewer.id) || seesAllParticipants(viewer);
    return {
      id: row.id, roomId: row.room_id, title: row.title, description: involved ? row.description : "",
      startsAt: row.starts_at, endsAt: row.ends_at, bookedBy: unknown(row.booked_by),
      participants: involved ? ids.filter(id => id !== row.booked_by).map(unknown) : null,
    };
  });
}

const dayRange = (date: string) => {
  const next = new Date(`${date}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return [wibInstant(date, "00:00"), wibInstant(next.toISOString().slice(0, 10), "00:00")] as const;
};

async function activeOn(date: string): Promise<BookingRow[]> {
  const [from, to] = dayRange(date);
  const { data, error } = await createPrivilegedClient().from("pw_room_bookings").select(bookingColumns)
    .eq("status", "aktif").gte("starts_at", from).lt("starts_at", to).order("starts_at");
  if (error) fail(error);
  return (data ?? []) as BookingRow[];
}

/**
 * Sessions that hold a room that day (migration 202611040004), as schedule entries. Nothing
 * before that migration.
 */
async function sessionsOn(date: string): Promise<Booking[]> {
  const [from, to] = dayRange(date);
  const client = createPrivilegedClient();
  const { data: holds, error } = await client.from("pw_room_holds").select("source_id,room_id,starts_at,ends_at").eq("source", "sesi").lt("starts_at", to).gt("ends_at", from);
  if (error || !holds?.length) return [];
  const { data: sessions } = await client.from("pw_sessions").select("id,title").in("id", holds.map(hold => hold.source_id));
  return holds.map(hold => ({
    id: `sesi:${hold.source_id}`, roomId: hold.room_id, title: sessions?.find(item => item.id === hold.source_id)?.title ?? "Sesi Pra WAM", description: "",
    startsAt: hold.starts_at, endsAt: hold.ends_at, bookedBy: { id: "", name: "Panitia Pra WAM", department: "" }, participants: null, isSession: true,
  }));
}

/** One day's schedule: every room, every active booking, and the sessions that hold a room. */
export async function daySchedule(date: string, viewer: Member): Promise<{ rooms: Room[]; bookings: Booking[] }> {
  const [rooms, rows, sessions] = await Promise.all([listRooms(), activeOn(date), sessionsOn(date)]);
  return { rooms, bookings: [...await withPeople(rows, viewer), ...sessions].sort((a, b) => a.startsAt.localeCompare(b.startsAt)) };
}

/** Bookings the person made or takes part in, from today on. */
export async function myBookings(viewer: Member, today: string): Promise<Booking[]> {
  const client = createPrivilegedClient();
  const { data: links, error: linkError } = await client.from("pw_room_booking_participants").select("booking_id").eq("employee_id", viewer.id).limit(500);
  if (linkError) fail(linkError);
  const ids = (links ?? []).map(link => link.booking_id);
  let query = client.from("pw_room_bookings").select(bookingColumns).eq("status", "aktif").gte("starts_at", wibInstant(today, "00:00"));
  query = ids.length ? query.or(`booked_by.eq.${viewer.id},id.in.(${ids.join(",")})`) : query.eq("booked_by", viewer.id);
  const { data, error } = await query.order("starts_at").limit(200);
  if (error) fail(error);
  return withPeople((data ?? []) as BookingRow[], viewer);
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
  const { data, error } = await createPrivilegedClient().from("pw_room_bookings").select(bookingColumns).eq("id", id).eq("status", "aktif").maybeSingle();
  if (error) fail(error);
  if (!data) throw new ServiceError(404, "Booking tidak ditemukan atau sudah dibatalkan.");
  const [booking] = await withPeople([data as BookingRow], viewer);
  return { ...booking, mine: data.booked_by === viewer.id, booker: data.booked_by };
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
export async function saveBooking(input: BookingInput, viewer: Member, options: { id?: string; confirmed?: boolean; now?: Date } = {}): Promise<Booking> {
  const now = options.now ?? new Date();
  if (!await appraisalOpen()) throw new ServiceError(409, "Booking ruang appraisal sedang ditutup oleh admin Pra WAM.");
  if (options.id) await requireOwn(options.id, viewer);
  const problems = bookingProblems(input, now);
  if (Object.keys(problems).length) throw new ServiceError(422, "Periksa kembali tanggal dan jam.", Object.fromEntries(Object.entries(problems).map(([key, message]) => [key, [message]])));
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

  const { data, error } = await createPrivilegedClient().rpc("pw_save_booking", {
    p_id: options.id ?? null, p_room: input.roomId, p_title: input.title, p_description: input.description,
    p_starts: span.startsAt, p_ends: span.endsAt, p_booked_by: viewer.id, p_participants: participants, p_max_per_day: appraisalRules.maxPerDay,
  });
  if (error) {
    if (error.code === "23P01") throw await roomTaken(input, viewer, now, options.id);
    if (/ROOM_NOT_BOOKABLE/.test(error.message)) throw new ServiceError(422, "Ruang ini tidak bisa dipesan untuk appraisal.", { roomId: ["Pilih ruang lain."] });
    if (/BOOKING_DAILY_LIMIT/.test(error.message)) throw new ServiceError(409, `Kamu sudah punya ${appraisalRules.maxPerDay} booking aktif pada hari itu. Batalkan salah satu dulu.`);
    if (/NOT_FOUND/.test(error.message)) throw new ServiceError(404, "Booking tidak ditemukan atau sudah dibatalkan.");
    if (error.code === "23514") throw new ServiceError(422, "Jam di luar 09.00–18.00 Senin–Jumat, atau lebih dari 4 jam.");
    if (error.code === "23503") throw new ServiceError(422, "Ada partisipan atau ruang yang tidak dikenal. Muat ulang halaman.");
    fail(error);
  }
  return getBooking(data as string, viewer);
}

/** The second person to save gets who took the room, and the nearest free options. */
async function roomTaken(input: BookingInput, viewer: Member, now: Date, ignoreId?: string): Promise<BookingConflict> {
  const [rooms, rows, sessions] = await Promise.all([listRooms(), activeOn(input.date), sessionsOn(input.date)]);
  const span = { startsAt: wibInstant(input.date, input.start), endsAt: wibInstant(input.date, input.end) };
  const taker = rows.find(row => row.id !== ignoreId && row.room_id === input.roomId && overlaps({ startsAt: row.starts_at, endsAt: row.ends_at }, span));
  const session = sessions.find(item => item.roomId === input.roomId && overlaps(item, span));
  const room = rooms.find(item => item.id === input.roomId)?.name ?? "Ruang ini";
  const name = taker ? (await listPeople()).find(person => person.id === taker.booked_by)?.name : undefined;
  const options = alternatives(input, rooms, [...rows.map(row => ({ id: row.id, roomId: row.room_id, startsAt: row.starts_at, endsAt: row.ends_at })), ...sessions], now, ignoreId);
  const message = !taker && session
    ? `${room} dipakai sesi ${session.title}, ${clockLabel(wibTime(session.startsAt))}–${clockLabel(wibTime(session.endsAt))}.`
    : taker && name
    ? `${room} baru saja dipesan ${taker.booked_by === viewer.id ? "olehmu" : name}, ${clockLabel(wibTime(taker.starts_at))}–${clockLabel(wibTime(taker.ends_at))}.`
    : `${room} sudah terpakai pada jam itu.`;
  return new BookingConflict(message, { kind: "room", ...options });
}

/** The booker cancels their own; panitia and admin may cancel anyone's (cancelled_by records who). */
export async function cancelBooking(id: string, viewer: Member): Promise<void> {
  const booking = await getBooking(id, viewer);
  if (!booking.mine && !cancelsAnyBooking(viewer)) throw new ServiceError(403, "Hanya pemesan atau panitia yang bisa membatalkan booking ini.");
  const { error } = await createPrivilegedClient().from("pw_room_bookings")
    .update({ status: "batal", cancelled_by: viewer.id, cancelled_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", id).eq("status", "aktif");
  if (error) fail(error);
}
