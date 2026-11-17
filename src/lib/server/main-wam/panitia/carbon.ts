import "server-only";
import { carbonDataFrom, carbonEstimate, nightsBetween, type CarbonResult } from "@/lib/main-wam/panitia/carbon";
import { wibDate } from "@/lib/main-wam/rundown";
import type { MainWamSettings } from "@/lib/main-wam/types";
import { currentForm } from "../../pra-wam/questionnaire";
import { allSessions, listTrips } from "../read";
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

/** Seats listed per trip (people on each leg). */
async function seatsPerTrip(): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const { data, error } = await db().from("mw_trip_seats").select("trip_id").limit(5000);
  if (error) return out;
  for (const row of data ?? []) out.set(row.trip_id as string, (out.get(row.trip_id as string) ?? 0) + 1);
  return out;
}

export async function carbonForEvent(settings: MainWamSettings): Promise<CarbonResult | null> {
  try {
    const [people, rooms, trips, seats, sessions] = await Promise.all([mainWamEventPeople(), roomsInUse(), listTrips(), seatsPerTrip(), allSessions()]);
    const first = settings.event.checkInAt ? wibDate(settings.event.checkInAt) : settings.event.startDate;
    const last = settings.event.checkOutAt ? wibDate(settings.event.checkOutAt) : settings.event.endDate;
    const result = carbonEstimate(carbonDataFrom({
      people: people.accounts.length, rooms, nights: nightsBetween(first, last), trips: trips.data, seats, sessions: sessions.data, bills: settings.carbon,
    }));
    return result.empty ? null : result;
  } catch { return null; }
}
