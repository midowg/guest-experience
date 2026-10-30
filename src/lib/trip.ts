import type { PlainImage } from "./types";

/**
 * A client trip's handbook parts that a single venue and a single PIC cannot hold (the Lombok
 * Guidebook needed them too): how the group travels, where it sleeps, everyone to call, and the
 * do's and don'ts. Each is a section of its own (transport, stay, contacts, guidelines) and stays
 * hidden until it has content. Times are plain text ("07.45"), so a time still to be confirmed can
 * say so in the leg's note instead of being guessed.
 */
export type TripMode = "train" | "flight" | "bus" | "car" | "boat";
export const tripModes = ["train", "flight", "bus", "car", "boat"] as const satisfies readonly TripMode[];
/** One journey of the group: a train out, a flight home. */
export type TripLeg = {
  id: string; mode: TripMode;
  /** "Kereta Taksaka", "Citilink"; `number` is the train or flight number. */
  carrier: string; number: string;
  /** As the guest reads it: "Kamis, 5 November 2026". */
  date: string; from: string; to: string; departs: string; arrives: string;
  /** Carriage and seats, or terminal and baggage. */
  seat: string; meeting_point: string; meeting_time: string; note: string;
};
export type TripTransport = { title: string; intro: string; legs: TripLeg[] };
export type TripStay = {
  title: string; name: string; address: string; maps_url: string; phone: string;
  check_in: string; check_out: string; breakfast_place: string; breakfast_time: string; meeting_point: string; note: string;
  photos: PlainImage[];
};
/** Anyone the guest may call: the project manager, the client's PIC, the hotel. */
export type TripPerson = { id: string; role: string; name: string; phone: string };
export type TripContacts = { title: string; intro: string; people: TripPerson[]; hospital: string; hospital_phone: string; hospital_address: string; hospital_maps_url: string };
export type TripGuidelines = { title: string; intro: string; weather: string; dos: string[]; donts: string[] };
export type TripContent = { transport: TripTransport; stay: TripStay; contacts: TripContacts; guidelines: TripGuidelines };

/** The section keys of the trip's parts; only a Program shows them. */
export const tripSectionKeys = ["transport", "stay", "guidelines", "contacts"] as const;
export function isTripSection(key: string): key is (typeof tripSectionKeys)[number] {
  return (tripSectionKeys as readonly string[]).includes(key);
}

export const TRIP_LIMITS = { legs: 6, photos: 4, people: 8, lines: 10 } as const;

export function emptyTrip(): TripContent {
  return {
    transport: { title: "", intro: "", legs: [] },
    stay: { title: "", name: "", address: "", maps_url: "", phone: "", check_in: "", check_out: "", breakfast_place: "", breakfast_time: "", meeting_point: "", note: "", photos: [] },
    contacts: { title: "", intro: "", people: [], hospital: "", hospital_phone: "", hospital_address: "", hospital_maps_url: "" },
    guidelines: { title: "", intro: "", weather: "", dos: [], donts: [] },
  };
}

/** Documents saved before the trip parts existed carry none of them. */
export function normalizeTrip(trip: Partial<TripContent> | undefined): TripContent {
  const empty = emptyTrip();
  return {
    transport: { ...empty.transport, ...trip?.transport, legs: trip?.transport?.legs ?? [] },
    stay: { ...empty.stay, ...trip?.stay, photos: trip?.stay?.photos ?? [] },
    contacts: { ...empty.contacts, ...trip?.contacts, people: trip?.contacts?.people ?? [] },
    guidelines: { ...empty.guidelines, ...trip?.guidelines, dos: trip?.guidelines?.dos ?? [], donts: trip?.guidelines?.donts ?? [] },
  };
}

/** Whether each part has something to show; an empty part stays off the guest page. */
export const tripFilled = {
  transport: (trip: TripContent | undefined) => !!trip?.transport.legs.length,
  stay: (trip: TripContent | undefined) => !!trip?.stay.name,
  contacts: (trip: TripContent | undefined) => !!trip?.contacts.people.length || !!trip?.contacts.hospital,
  guidelines: (trip: TripContent | undefined) => !!trip && (trip.guidelines.dos.length + trip.guidelines.donts.length > 0 || !!trip.guidelines.weather),
};

/** "0811-2546-096" → "08112546096"; "+62 811…" and "+62 (0)274…" → "0811…", "0274…". Landlines keep their area code. */
export function dialNumber(phone: string): string {
  const digits = phone.replace(/\(0\)/g, "").replace(/[^\d+]/g, "");
  return digits.startsWith("+62") ? `0${digits.slice(3)}` : digits;
}
