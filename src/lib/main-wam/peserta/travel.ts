import { wibDate } from "../rundown";
import type { MainWamEventInfo, MwTrip, MwTripSeat, TripDirection, TripKind } from "../types";
import { t, type Lang } from "../i18n";
import { dateLabel, durationLabel, hhmm } from "./format";

/*
 * Perjalanan (L03, revisi 16 Nov): Berangkat and Pulang, each a line of steps (kumpul, kereta as a
 * ticket, shuttle, tiba di hotel), the person's own seat or bus, and the coordinator to call. Pure.
 */

/** The direction to open on: the asked one, else pulang from the last day of the event on. */
export function travelDirection(asked: string | string[] | undefined, now: Date, event: Pick<MainWamEventInfo, "endDate">): TripDirection {
  const value = Array.isArray(asked) ? asked[0] : asked;
  if (value === "pulang" || value === "berangkat") return value;
  return wibDate(now.toISOString()) >= event.endDate ? "pulang" : "berangkat";
}

/** "Berangkat · Sen, 4 Jan": the segment's words, with the day of its first step. */
export function directionLabel(direction: TripDirection, trips: readonly MwTrip[], lang: Lang = "id"): string {
  const first = trips.filter(trip => trip.direction === direction && trip.startsAt).sort((a, b) => a.sort - b.sort)[0];
  const word = t(lang, direction === "berangkat" ? "peserta.travel.out" : "peserta.travel.back");
  return first?.startsAt ? `${word} · ${dateLabel(wibDate(first.startsAt), lang)}` : word;
}

export type Ticket = {
  from: string; to: string; depart: string; arrive: string; duration: string;
  /** The 2 × 2 under the tear: Kereta | Kelas, Gerbong | Kursi (only what is known). */
  cols: { label: string; value: string }[];
  note: string;
};

export type TravelStep = {
  id: string;
  kind: TripKind;
  title: string;
  /** The line under the title ("Stasiun Tugu Yogyakarta · pintu selatan", "Bus 2 · St. Malang ke hotel"). */
  line: string;
  /** "05.30" or "Check-in 15.30 · Kamar 208". */
  sub: string;
  ticket: Ticket | null;
  mapUrl: string;
  /** "Tiba di hotel" opens Kamar. */
  toRoom: boolean;
};

/** "KA (contoh) · Ekonomi" → train and class; "Gerbong 3 · Kursi 12A" → coach and seat. */
export function ticketOf(trip: MwTrip, seat: MwTripSeat | undefined, lang: Lang = "id"): Ticket | null {
  if (trip.kind !== "kereta" || !trip.startsAt) return null;
  const [from = "", to = ""] = trip.place.split("→").map(part => part.trim());
  const [train = "", klass = ""] = trip.detail.split("·").map(part => part.trim());
  const seatText = seat?.seat.trim() ?? "";
  const coach = /gerbong\s*([\w-]+)/i.exec(seatText)?.[1] ?? "";
  const chair = /kursi\s*([\w-]+)/i.exec(seatText)?.[1] ?? "";
  const cols = [
    { label: t(lang, "peserta.travel.train"), value: train }, { label: t(lang, "peserta.travel.class"), value: klass },
    ...(coach || chair ? [{ label: t(lang, "peserta.travel.coach"), value: coach }, { label: t(lang, "peserta.travel.seat"), value: chair }] : seatText ? [{ label: t(lang, "peserta.travel.seat"), value: seatText }] : []),
  ].filter(col => col.value);
  return {
    from, to, depart: hhmm(trip.startsAt, lang), arrive: trip.endsAt ? hhmm(trip.endsAt, lang) : "",
    duration: trip.endsAt ? durationLabel(trip.startsAt, trip.endsAt, lang) : "", cols, note: trip.note.trim(),
  };
}

/** The steps of one direction, in order, with the person's seats. */
export function travelSteps(trips: readonly MwTrip[], seats: readonly MwTripSeat[], direction: TripDirection, roomName: string | null, lang: Lang = "id"): TravelStep[] {
  const seatOf = new Map(seats.map(seat => [seat.tripId, seat]));
  return trips.filter(trip => trip.direction === direction)
    .sort((a, b) => a.sort - b.sort || Date.parse(a.startsAt ?? "") - Date.parse(b.startsAt ?? ""))
    .map(trip => {
      const seat = seatOf.get(trip.id);
      const time = trip.startsAt ? hhmm(trip.startsAt, lang) : "";
      const route = lang === "id" ? trip.place.replace(/\s*→\s*/g, " ke ") : trip.place.replace(/\s*→\s*/g, " to ");
      if (trip.kind === "tiba") {
        return { id: trip.id, kind: trip.kind, title: trip.title, line: "", sub: [trip.detail.trim() || (time ? t(lang, "peserta.travel.checkIn", { time }) : ""), roomName ? t(lang, "peserta.travel.roomName", { name: roomName }) : ""].filter(Boolean).join(" · "), ticket: null, mapUrl: trip.mapUrl, toRoom: !!roomName };
      }
      const ticket = ticketOf(trip, seat, lang);
      const vehicle = [seat?.vehicle.trim(), seat && !ticket ? seat.seat.trim() : ""].filter(Boolean).join(" · ");
      const line = ticket ? "" : [vehicle, route].filter(Boolean).join(" · ");
      return { id: trip.id, kind: trip.kind, title: trip.title, line, sub: ticket ? "" : time, ticket, mapUrl: trip.mapUrl, toRoom: false };
    });
}

/** The coordinator of a direction: the first step that names one. */
export const coordinatorOf = (trips: readonly MwTrip[], direction: TripDirection) =>
  trips.filter(trip => trip.direction === direction && trip.coordinatorId).sort((a, b) => a.sort - b.sort)[0]?.coordinatorId ?? null;
