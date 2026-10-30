import { officeCover, officeRoute } from "./place-guide";
import type { EventRecord } from "./types";

/*
 * What a new Kunjungan Kantor at the Werkudara office starts with (board 11, "Cara datang"): the
 * way in from the main road with the guide's photos, and who walks the guests in. The admin edits it;
 * nothing here is a placeholder to fill. The public guide to the office is Panduan lokasi
 * (src/lib/place-guide.ts), kept apart from visits.
 */

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
    // The turns with their photos and the map, as in the Werkudara guide (Your Visit); arrival points are added by hand.
    route: atOffice ? { ...event.route, map_image: officeRoute.map_image, steps: officeRoute.steps } : event.route,
  };
}
