import { officeCover } from "./place-guide";
import type { EventRecord, RouteStep } from "./types";

/*
 * What a new Kunjungan Kantor at the Werkudara office starts with (board 11, "Cara datang"): the
 * way in from the main road and who walks the guests in. The admin edits it and adds the photos;
 * nothing here is a placeholder to fill. The public guide to the office is Panduan lokasi
 * (src/lib/place-guide.ts), kept apart from visits.
 */

const noImage = { url: "", alt: "", srcset: [] };

export const officeRouteSteps: RouteStep[] = [
  { title: "Lewat Jl. Pondok Raya", description: "Rute paling mudah dan lebar. Hindari Jl. Tengiri Raya.", image: noImage },
  { title: "Belok di Jl. Bhinneka", description: "Perhatikan titik belok seperti di foto.", image: noImage },
  { title: "Parkir di depan kantor", description: "Area parkir tamu tepat di depan gedung.", image: noImage },
];

/**
 * The visit's starting content; the route and the office's front as the opening photo only when the
 * visit is at the office they show (board 12: "Foto bawaan templat · bisa diganti").
 */
export function visitStarter(event: EventRecord, atOffice: boolean): EventRecord {
  return {
    ...event,
    hero: atOffice && !event.hero.url ? { ...event.hero, url: officeCover.url, alt: officeCover.alt, srcset: officeCover.srcset } : event.hero,
    organizer: event.organizer || "Werkudara Group",
    contact: { ...event.contact, role: event.contact.role || "Hospitality Specialist" },
    route: atOffice ? { ...event.route, steps: officeRouteSteps } : event.route,
  };
}
