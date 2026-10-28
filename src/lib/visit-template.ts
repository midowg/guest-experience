import type { ArrivalPoint, EventRecord, RouteStep } from "./types";

/*
 * What a new Kunjungan Kantor at the Werkudara office starts with (board 11, "Cara datang"): the
 * way in from the main road, what to do on arrival, and who walks the guests in. The admin edits
 * it and adds the photos; nothing here is a placeholder to fill.
 */

const noImage = { url: "", alt: "", srcset: [] };

export const officeRouteSteps: RouteStep[] = [
  { title: "Lewat Jl. Pondok Raya", description: "Rute paling mudah dan lebar. Hindari Jl. Tengiri Raya.", image: noImage },
  { title: "Belok di Jl. Bhinneka", description: "Perhatikan titik belok seperti di foto.", image: noImage },
  { title: "Parkir di depan kantor", description: "Area parkir tamu tepat di depan gedung.", image: noImage },
];

export const officeArrivalPoints: ArrivalPoint[] = [
  { icon: "door", title: "Lobi & resepsionis", description: "Masuk lewat pintu kaca utama; resepsionis akan mengantar." },
  { icon: "pin", title: "Titik temu", description: "Jika terlambat, tunggu di pendopo — kami jemput." },
];

/** The visit's starting content; the route only when the visit is at the office it describes. */
export function visitStarter(event: EventRecord, atOffice: boolean): EventRecord {
  return {
    ...event,
    organizer: event.organizer || "Werkudara Group",
    contact: { ...event.contact, role: event.contact.role || "Hospitality Specialist" },
    route: atOffice ? { ...event.route, steps: officeRouteSteps, points: officeArrivalPoints } : event.route,
  };
}
