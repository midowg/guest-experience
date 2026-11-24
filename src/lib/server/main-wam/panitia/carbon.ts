import "server-only";
import { carbonDataFrom, carbonEstimate, nightsBetween, type CarbonResult } from "@/lib/main-wam/panitia/carbon";
import { wibDate } from "@/lib/main-wam/rundown";
import type { MainWamSettings } from "@/lib/main-wam/types";
import { currentForm } from "../../pra-wam/questionnaire";
import { allSessions, listTrips } from "../read";
import { samplePeople } from "@/lib/main-wam/sample";
import { mainWamEventPeople } from "../people";
import { db } from "./common";

/*
 * Jejak karbon from what Admin WAM already holds (no form for anyone): the event's people, the
 * rooms of HR's pairing (Kuesioner → Kamar) that have someone in them × the nights between check-in
 * and check-out (or the event's first and last day), the trips' km and buses, the rundown's meals,
 * and the hotel's bills once filled in (Info acara). Never throws: null when it cannot be counted.
 */

/** Rooms of HR's pairing with at least one person (0 before the pairing exists). */
async function roomsInUse(): Promise<number> {
  try {
    const form = await currentForm();
    if (!form) return 0;
    const { data, error } = await db().from("cq_stay_members").select("room_id").eq("form_id", form.id).limit(2000);
    if (error) return 0;
    return new Set((data ?? []).map(row => row.room_id as string)).size;
  } catch { return 0; }
}

/** Every seat listed (trip and person): the totals count them per trip, a person's own footprint reads theirs. */
async function seatRows(): Promise<{ tripId: string; employeeId: string }[]> {
  const { data, error } = await db().from("mw_trip_seats").select("trip_id,employee_id").limit(5000);
  if (error) return [];
  return (data ?? []).map(row => ({ tripId: row.trip_id as string, employeeId: row.employee_id as string }));
}

/** Seats listed per trip (people on each leg). */
export function seatsPerTrip(rows: readonly { tripId: string }[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const row of rows) out.set(row.tripId, (out.get(row.tripId) ?? 0) + 1);
  return out;
}

/** What the estimate needs from Admin WAM, read once: the event's total and a person's own share both count from it. */
export async function gatherCarbon(settings: MainWamSettings) {
  const [people, rooms, trips, seats, sessions] = await Promise.all([mainWamEventPeople(), roomsInUse(), listTrips(), seatRows(), allSessions()]);
  const first = settings.event.checkInAt ? wibDate(settings.event.checkInAt) : settings.event.startDate;
  const last = settings.event.checkOutAt ? wibDate(settings.event.checkOutAt) : settings.event.endDate;
  const count = settings.sampleRundown ? Object.keys(samplePeople).length : people.accounts.length;
  const nights = nightsBetween(first, last);
  const data = carbonDataFrom({ people: count, rooms, nights, trips: trips.data, seats: seatsPerTrip(seats), sessions: sessions.data, bills: settings.carbon });
  return { people: count, nights, trips: trips.data, seats, sessions: sessions.data, result: carbonEstimate(data) };
}

export async function carbonForEvent(settings: MainWamSettings): Promise<CarbonResult | null> {
  try {
    const { result } = await gatherCarbon(settings);
    return result.empty ? null : result;
  } catch { return null; }
}
