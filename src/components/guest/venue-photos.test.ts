import { describe, expect, it } from "vitest";
import { venuePhotos } from "./Gallery";
import { createSeedEvent } from "@/lib/seed-event";
import type { GalleryImage } from "@/lib/types";
const photo = (n: number): GalleryImage => ({ id: `30f3a511-2331-4000-8000-00000000000${n}`, url: `https://cdn.example.test/${n}.jpg`, alt: "", caption: "Kredit foto", sort_order: n, srcset: [] });
describe("gallery is the only source of venue photos", () => {
  it("ignores the legacy standalone photo even if the gallery is empty", () => {
    const event = { ...createSeedEvent(), venue_image_url: "https://cdn.example.test/old.jpg" };
    expect(venuePhotos(event)).toEqual([]);
  });
  it("does not prepend a legacy photo to the gallery", () => {
    const event = { ...createSeedEvent(), venue_image_url: "https://cdn.example.test/old.jpg", gallery: [photo(1)] };
    expect(venuePhotos(event)).toEqual([photo(1)]);
  });
  it("sorts gallery without mutating stored order and preserves captions", () => {
    const event = { ...createSeedEvent(), gallery: [photo(2), photo(1)] };
    expect(venuePhotos(event)).toEqual([photo(1), photo(2)]);
    expect(event.gallery[0].sort_order).toBe(2);
    expect(venuePhotos(event)[0].caption).toBe("Kredit foto");
  });
});
