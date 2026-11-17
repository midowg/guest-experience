import "server-only";
import { tripRow, type SeatsInput, type TripInput } from "@/lib/main-wam/admin/trips";
import { TRIP_COLUMNS, TRIP_SEAT_COLUMNS, tripFromRow, tripSeatFromRow } from "@/lib/main-wam/rows";
import type { MwTrip, MwTripSeat } from "@/lib/main-wam/types";
import { isSupabaseConfigured, ServiceError } from "../../config";
import { mwMissing, mwWaiting } from "../errors";
import { adminFail, assertPeople, db, rpcFail } from "./common";

/*
 * Admin WAM → Main WAM → Perjalanan (agen E): the steps there and back, their coordinator and
 * rundown session, km and buses for Jejak karbon, and each person's seat or vehicle (set as a list
 * through migration 202611200501's function). Every answer is the whole list again.
 */

export type TripBoard = { trips: MwTrip[]; seats: MwTripSeat[]; migrated: boolean };

export async function adminTrips(): Promise<TripBoard> {
  if (!isSupabaseConfigured()) return { trips: [], seats: [], migrated: false };
  const [trips, seats] = await Promise.all([
    db().from("mw_trips").select(TRIP_COLUMNS).order("direction").order("sort").order("starts_at").limit(200),
    db().from("mw_trip_seats").select(TRIP_SEAT_COLUMNS).limit(10_000),
  ]);
  for (const result of [trips, seats]) if (result.error) { if (mwMissing(result.error)) return { trips: [], seats: [], migrated: false }; adminFail(result.error); }
  return { trips: (trips.data ?? []).map(row => tripFromRow(row)), seats: (seats.data ?? []).map(row => tripSeatFromRow(row)), migrated: true };
}
async function boardOrWait(): Promise<TripBoard> {
  const board = await adminTrips();
  if (!board.migrated) throw mwWaiting();
  return board;
}

const refusals = { invalid: "Isian langkah belum sesuai (jam tiba setelah berangkat, tautan peta diawali https://).", inUse: "Koordinator atau sesi yang dipilih sudah tidak ada. Pilih lagi." };

async function checkRefs(input: TripInput): Promise<void> {
  await assertPeople([input.coordinatorId]);
  if (input.sessionId) {
    const { data, error } = await db().from("mw_sessions").select("id").eq("id", input.sessionId).maybeSingle();
    if (error) adminFail(error);
    if (!data) throw new ServiceError(422, "Sesi rundown yang dipilih sudah tidak ada. Pilih lagi.", { sessionId: ["Pilih sesi lagi."] });
  }
}

export async function createTrip(input: TripInput): Promise<TripBoard & { id: string }> {
  await checkRefs(input);
  const { data, error } = await db().from("mw_trips").insert(tripRow(input)).select("id").single();
  if (error) adminFail(error, refusals);
  return { ...(await boardOrWait()), id: data.id as string };
}

export async function updateTrip(id: string, input: TripInput): Promise<TripBoard> {
  await checkRefs(input);
  const { data, error } = await db().from("mw_trips").update({ ...tripRow(input), updated_at: new Date().toISOString() }).eq("id", id).select("id");
  if (error) adminFail(error, refusals);
  if (!data?.length) throw new ServiceError(404, "Langkah perjalanan tidak ditemukan. Muat ulang halaman.");
  return boardOrWait();
}

export async function deleteTrip(id: string): Promise<TripBoard> {
  const { data, error } = await db().from("mw_trips").delete().eq("id", id).select("id");
  if (error) adminFail(error);
  if (!data?.length) throw new ServiceError(404, "Langkah perjalanan tidak ditemukan. Muat ulang halaman.");
  return boardOrWait();
}

/** Kursi and kendaraan of one step; `replace` clears everyone not listed. */
export async function setSeats(tripId: string, input: SeatsInput): Promise<TripBoard & { saved: number }> {
  await assertPeople(input.seats.map(seat => seat.employeeId));
  const { data, error } = await db().rpc("mw_admin_set_trip_seats", { p_trip: tripId, p_seats: input.seats, p_replace: input.replace });
  if (error) rpcFail(error);
  return { ...(await boardOrWait()), saved: Number(data ?? input.seats.length) };
}
