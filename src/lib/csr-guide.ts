import type { EventRecord } from "./types";

/**
 * The way to the drop-off point, taken from the published Panduan lokasi (/your-visit) so it is
 * written once: the route map, the steps with their photos, the arrival notes, up to four photos. The
 * Friday Sharing page shows it in its own theme.
 */
export type CsrGuide = {
  venueName: string; address: string; arrivalNotes: string; locationUrl: string;
  mapImage: EventRecord["route"]["map_image"];
  steps: EventRecord["route"]["steps"];
  points: NonNullable<EventRecord["route"]["points"]>;
  gallery: EventRecord["gallery"];
};

/** Null when there is no Panduan lokasi, or it says nothing about the way there. */
export function csrGuideFrom(place: EventRecord | null): CsrGuide | null {
  if (!place) return null;
  const steps = place.route?.steps ?? [];
  const mapImage = place.route?.map_image ?? { url: "", alt: "", srcset: [] };
  if (!steps.length && !mapImage.url && !place.address?.trim()) return null;
  return {
    venueName: place.venue_name ?? "", address: place.address ?? "", arrivalNotes: place.arrival_notes ?? "", locationUrl: place.location_url ?? "",
    mapImage, steps, points: place.route?.points ?? [], gallery: (place.gallery ?? []).slice(0, 4),
  };
}
