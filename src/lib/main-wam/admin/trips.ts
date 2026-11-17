import { z } from "zod";
import { wibDate, wibInstant, wibTime } from "../rundown";
import { TRIP_DIRECTIONS, TRIP_KINDS, type MwTrip } from "../types";
import { matchPerson, type AdminPerson } from "./people";
import { DATE, TIME, type ImportRow } from "./rundown";
import { MAX_PASTE_ROWS, cellAt, parseTsv, readColumns } from "./tsv";

/*
 * Admin WAM → Main WAM → Perjalanan (agen E): the steps there and back (titik kumpul, kereta,
 * shuttle, tiba), who coordinates each, each person's seat or vehicle (typed or pasted), and the
 * km and buses Jejak karbon is computed from. Pure: tested without a server.
 */

export const tripInputSchema = z.object({
  direction: z.enum(TRIP_DIRECTIONS, { message: "Pilih berangkat atau pulang." }),
  kind: z.enum(TRIP_KINDS, { message: "Jenis langkah tidak dikenal." }),
  title: z.string().trim().min(2, "Tulis judul, misalnya Kereta.").max(100, "Judul paling panjang 100 karakter."),
  place: z.string().trim().max(200, "Tempat atau rute paling panjang 200 karakter."),
  date: z.string().regex(DATE, "Pilih hari.").nullable(),
  start: z.string().regex(TIME, "Tulis jam, misalnya 05.30.").nullable(),
  end: z.string().regex(TIME, "Tulis jam tiba, misalnya 14.00, atau kosongkan.").nullable(),
  detail: z.string().trim().max(300, "Rincian paling panjang 300 karakter."),
  note: z.string().trim().max(300, "Catatan paling panjang 300 karakter."),
  mapUrl: z.string().trim().max(500).refine(value => value === "" || /^https:\/\/[^\s]+$/.test(value), "Tautan peta diawali https://."),
  coordinatorId: z.uuid({ message: "Koordinator tidak dikenali." }).nullable(),
  sessionId: z.uuid({ message: "Sesi tidak dikenali." }).nullable(),
  distanceKm: z.number({ message: "Jarak berupa angka." }).min(0, "Jarak tidak boleh minus.").max(5000, "Jarak paling jauh 5.000 km.").nullable(),
  vehicles: z.number({ message: "Jumlah kendaraan berupa angka." }).int("Jumlah kendaraan bilangan bulat.").min(0).max(200, "Paling banyak 200 kendaraan.").nullable(),
  sort: z.number().int().min(0).max(10_000),
}).superRefine((value, ctx) => {
  if ((value.start || value.end) && !value.date) ctx.addIssue({ code: "custom", path: ["date"], message: "Pilih harinya juga." });
  if (value.end && !value.start) ctx.addIssue({ code: "custom", path: ["start"], message: "Isi jam berangkat dulu." });
  if (value.end && value.start && value.end <= value.start) ctx.addIssue({ code: "custom", path: ["end"], message: "Jam tiba harus setelah jam berangkat." });
});
export type TripInput = z.infer<typeof tripInputSchema>;

export const blankTrip = (direction: MwTrip["direction"], date: string | null, sort = 0): TripInput => ({
  direction, kind: "lain", title: "", place: "", date, start: null, end: null, detail: "", note: "", mapUrl: "", coordinatorId: null, sessionId: null, distanceKm: null, vehicles: null, sort,
});

export function tripToInput(trip: MwTrip): TripInput {
  return {
    direction: trip.direction, kind: trip.kind, title: trip.title, place: trip.place, date: trip.startsAt ? wibDate(trip.startsAt) : null,
    start: trip.startsAt ? wibTime(trip.startsAt) : null, end: trip.endsAt ? wibTime(trip.endsAt) : null, detail: trip.detail, note: trip.note, mapUrl: trip.mapUrl,
    coordinatorId: trip.coordinatorId, sessionId: trip.sessionId, distanceKm: trip.distanceKm, vehicles: trip.vehicles, sort: trip.sort,
  };
}

export function tripRow(input: TripInput): Record<string, unknown> {
  const at = (time: string | null) => (input.date && time ? new Date(wibInstant(input.date, time)).toISOString() : null);
  return {
    direction: input.direction, kind: input.kind, title: input.title, place: input.place, starts_at: at(input.start), ends_at: at(input.end), detail: input.detail,
    note: input.note, map_url: input.mapUrl, coordinator_id: input.coordinatorId, session_id: input.sessionId, distance_km: input.distanceKm,
    vehicles: input.vehicles, sort: input.sort,
  };
}

/** Kursi and kendaraan of one step. `replace`: everyone not listed loses their seat on it. */
export const seatsInputSchema = z.object({
  seats: z.array(z.object({
    employeeId: z.uuid(),
    seat: z.string().trim().max(60, "Kursi paling panjang 60 karakter."),
    vehicle: z.string().trim().max(60, "Kendaraan paling panjang 60 karakter."),
  })).max(MAX_PASTE_ROWS),
  replace: z.boolean(),
}).refine(value => new Set(value.seats.map(seat => seat.employeeId)).size === value.seats.length, "Ada orang yang tertulis dua kali.");
export type SeatsInput = z.infer<typeof seatsInputSchema>;

const SEAT_COLUMNS = {
  person: /^(nama( karyawan| lengkap| peserta| penumpang)?|karyawan|peserta|penumpang)$/,
  seat: /^(kursi|seat|tempat duduk|no(mor)? kursi|gerbong( dan kursi)?)\b/,
  vehicle: /^(kendaraan|bus|mobil|armada|vehicle)\b/,
};
export const seatColumnLabels = ["Nama karyawan", "Kursi", "Kendaraan"];

export type SeatPaste = { rows: ImportRow<SeatsInput["seats"][number]>[]; header: boolean };

/** Seats pasted from a sheet: the person, their seat ("Gerbong 3 · 12A") and/or vehicle ("Bus 2"). */
export function parseSeatPaste(paste: string, people: readonly AdminPerson[]): SeatPaste {
  const all = parseTsv(paste);
  const { columns, header } = readColumns(all, SEAT_COLUMNS, { person: 0, seat: 1, vehicle: 2 }, 2);
  const rows = (header ? all.slice(1) : all).slice(0, MAX_PASTE_ROWS);
  const seen = new Map<string, number>();
  const parsed = rows.map((cells, index) => {
    const line = index + (header ? 2 : 1);
    const errors: string[] = [];
    const found = matchPerson(cellAt(cells, columns.person), people);
    if (!found.person) errors.push(found.error);
    const seat = cellAt(cells, columns.seat), vehicle = cellAt(cells, columns.vehicle);
    if (!seat && !vehicle) errors.push("Isi kursi atau kendaraannya.");
    if (seat.length > 60) errors.push("Kursi paling panjang 60 karakter.");
    if (vehicle.length > 60) errors.push("Kendaraan paling panjang 60 karakter.");
    if (found.person) {
      const before = seen.get(found.person.id);
      if (before) errors.push(`${found.person.fullName} sudah ada di baris ${before}.`);
      else seen.set(found.person.id, line);
    }
    return { line, cells, errors, input: errors.length ? null : { employeeId: found.person!.id, seat, vehicle } };
  });
  if ((header ? all.length - 1 : all.length) > MAX_PASTE_ROWS) parsed.push({ line: MAX_PASTE_ROWS + 1, cells: [], errors: [`Paling banyak ${MAX_PASTE_ROWS} baris sekali impor.`], input: null });
  return { rows: parsed, header };
}

/** "350 km · 4 bus": what Jejak karbon reads off a step. */
export function carbonLine(trip: Pick<MwTrip, "kind" | "distanceKm" | "vehicles">): string {
  const parts = [trip.distanceKm !== null ? `${trip.distanceKm.toLocaleString("id-ID")} km` : "", trip.vehicles ? `${trip.vehicles} ${trip.kind === "bus" ? "bus" : "kendaraan"}` : ""];
  return parts.filter(Boolean).join(" · ");
}
