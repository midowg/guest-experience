import "server-only";
import { eventInfoColumns, type EventInfoInput } from "@/lib/main-wam/admin/event-info";
import { wibInstant } from "@/lib/main-wam/rundown";
import type { MainWamSettings } from "@/lib/main-wam/types";
import { ServiceError } from "../../config";
import { mainWamSettingsState, writeSettingsColumns } from "../settings";
import { adminFail, adminWaiting, assertPeople, db } from "./common";

/*
 * Admin WAM → Main WAM → Info acara (agen E): the event's facts on fondasi's settings row
 * (mw_settings: event_name, venue, hotel, hotel_address, check_in_at, check_out_at, contacts,
 * groups_published_at, carbon). Only the parts sent change. Check-in after check-out is refused
 * here, against what is saved, before the database would.
 */

export async function saveEventInfo(input: EventInfoInput): Promise<MainWamSettings> {
  const current = await mainWamSettingsState();
  if (!current.migrated) throw adminWaiting();
  if (input.contacts) await assertPeople([input.contacts.kamar, input.contacts.perjalanan, input.contacts.umum]);
  const checkIn = input.checkIn !== undefined ? (input.checkIn ? wibInstant(input.checkIn.date, input.checkIn.time) : null) : current.event.checkInAt;
  const checkOut = input.checkOut !== undefined ? (input.checkOut ? wibInstant(input.checkOut.date, input.checkOut.time) : null) : current.event.checkOutAt;
  if (checkIn && checkOut && Date.parse(checkOut) <= Date.parse(checkIn)) throw new ServiceError(422, "Check-out harus setelah check-in.", { checkOut: ["Check-out harus setelah check-in."] });
  let publishedAt: string | null = null;
  if (input.groupsPublished) {
    const { data, error } = await db().from("mw_settings").select("groups_published_at").eq("id", true).maybeSingle();
    if (error) adminFail(error);
    publishedAt = (data as { groups_published_at: string | null } | null)?.groups_published_at ?? null;
  }
  const columns = eventInfoColumns(input, new Date(), publishedAt);
  if (!Object.keys(columns).length) return current;
  return writeSettingsColumns(columns);
}
