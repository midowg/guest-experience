import { z } from "zod";
import { wibDate, wibInstant, wibTime } from "../rundown";
import type { CarbonInputs, MainWamSettings } from "../types";
import { DATE, TIME } from "./rundown";

/*
 * Admin WAM → Main WAM → Info acara (agen E): the event's name, the hotel, its address, check-in
 * and check-out, who to call (kamar, perjalanan, panitia), whether kelompok are shown, and the
 * hotel's bills after the event for Jejak karbon (optional; "final" only once all four are in).
 * Written to mw_settings (fondasi's one row). Pure.
 */

const stay = z.object({ date: z.string().regex(DATE, "Pilih tanggal."), time: z.string().regex(TIME, "Tulis jam, misalnya 14.00.") }).nullable();
const amount = (label: string, max: number) => z.number({ message: `${label} berupa angka.` }).min(0, `${label} tidak boleh minus.`).max(max, `${label} terlalu besar.`).nullable();

export const carbonInputSchema = z.object({
  listrikKwh: amount("Listrik", 10_000_000),
  airM3: amount("Air", 1_000_000),
  lpgKg: amount("LPG", 1_000_000),
  sampahKg: amount("Sampah", 1_000_000),
  final: z.boolean(),
}).refine(value => !value.final || [value.listrikKwh, value.airM3, value.lpgKg, value.sampahKg].every(item => item !== null), { message: "Tandai final setelah keempat angka tagihan diisi.", path: ["final"] });

/** PUT mainWamAdminApi.eventInfo: any part, the rest stays. */
export const eventInfoSchema = z.object({
  name: z.string().trim().min(2, "Tulis nama acara.").max(80, "Nama acara paling panjang 80 karakter.").optional(),
  venue: z.string().trim().max(150, "Kota atau tempat paling panjang 150 karakter.").optional(),
  hotel: z.string().trim().max(150, "Nama hotel paling panjang 150 karakter.").optional(),
  address: z.string().trim().max(300, "Alamat paling panjang 300 karakter.").optional(),
  checkIn: stay.optional(),
  checkOut: stay.optional(),
  contacts: z.object({ kamar: z.uuid().nullable(), perjalanan: z.uuid().nullable(), umum: z.uuid().nullable() }).optional(),
  groupsPublished: z.boolean().optional(),
  carbon: carbonInputSchema.optional(),
}).strict().superRefine((value, ctx) => {
  if (value.checkIn && value.checkOut && wibInstant(value.checkOut.date, value.checkOut.time) <= wibInstant(value.checkIn.date, value.checkIn.time)) {
    ctx.addIssue({ code: "custom", path: ["checkOut"], message: "Check-out harus setelah check-in." });
  }
});
export type EventInfoInput = z.infer<typeof eventInfoSchema>;

/** A stay time of the settings, as the form shows it. */
export const stayParts = (iso: string | null) => (iso ? { date: wibDate(iso), time: wibTime(iso) } : null);

/**
 * The mw_settings columns of an input. `groupsPublished` keeps the first publishing time when it
 * stays on (`publishedAt`: the current value). Check-in after check-out with only one side sent
 * is caught by the database (mw_settings_stay); the server reads it back as a plain message.
 */
export function eventInfoColumns(input: EventInfoInput, now: Date, publishedAt: string | null): Record<string, unknown> {
  const columns: Record<string, unknown> = {};
  if (input.name !== undefined) columns.event_name = input.name;
  if (input.venue !== undefined) columns.venue = input.venue;
  if (input.hotel !== undefined) columns.hotel = input.hotel;
  if (input.address !== undefined) columns.hotel_address = input.address;
  if (input.checkIn !== undefined) columns.check_in_at = input.checkIn ? new Date(wibInstant(input.checkIn.date, input.checkIn.time)).toISOString() : null;
  if (input.checkOut !== undefined) columns.check_out_at = input.checkOut ? new Date(wibInstant(input.checkOut.date, input.checkOut.time)).toISOString() : null;
  if (input.contacts !== undefined) columns.contacts = input.contacts;
  if (input.groupsPublished !== undefined) columns.groups_published_at = input.groupsPublished ? publishedAt ?? now.toISOString() : null;
  if (input.carbon !== undefined) columns.carbon = input.carbon;
  return columns;
}

/** How many of the four bills are in ("2 dari 4"). */
export const carbonFilled = (carbon: CarbonInputs) => [carbon.listrikKwh, carbon.airM3, carbon.lpgKg, carbon.sampahKg].filter(item => item !== null).length;

/** What the form starts from. */
export function eventInfoOf(settings: MainWamSettings) {
  return {
    name: settings.event.name, venue: settings.event.venue, hotel: settings.event.hotel, address: settings.event.address,
    checkIn: stayParts(settings.event.checkInAt), checkOut: stayParts(settings.event.checkOutAt), contacts: settings.contacts, carbon: settings.carbon,
  };
}
