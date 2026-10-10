import { notFound } from "next/navigation";
import { EventExperience } from "@/components/guest/EventExperience";
import { createSeedEvent } from "@/lib/seed-event";
import type { HeroTextPosition } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Placeholder photography, for layout checking only — never shipped as event content. */
const sampleGallery = [1, 2, 3].map((n, index) => ({
  id: `aaaaaaaa-0000-4000-8000-00000000000${n}`,
  url: `https://picsum.photos/seed/werkudara${n}/1600/1000`,
  alt: "",
  caption: index === 0 ? "Contoh keterangan foto" : "",
  sort_order: index,
  srcset: [],
}));

const POSITIONS = new Set<HeroTextPosition>(["left", "center"]);
const MAP_EMBED_URL = "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d2350.7163428830067!2d110.40227360184343!3d-7.745421472090749!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x2e7a575cc5c60b55%3A0x857e128884471468!2sWerkudara%20Group!5e0!3m2!1sid!2sid!4v1791620156842!5m2!1sid!2sid";

/**
 * Development-only rendering check for the guest layout. Never reachable in a production
 * build, and never a stand-in for a real published event.
 *
 * ?photos=0..3 gallery size · ?hero=0 text-only opening · ?pos=left|center text placement
 * ?venue=0 drop the separate venue photo · ?preview=0 hide the admin banner · ?map=0 show the manual location
 */
export default async function DevPreviewPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const params = await searchParams;
  const read = (key: string) => { const value = params[key]; return (Array.isArray(value) ? value[0] : value) ?? ""; };
  const count = Math.max(0, Math.min(3, Number(read("photos") || 3) || 0));
  const position = POSITIONS.has(read("pos") as HeroTextPosition) ? read("pos") as HeroTextPosition : "left";
  const hero = read("hero") === "0"
    ? { url: "", alt: "", srcset: [], focus: "center" as const, text_position: position }
    : {
      url: "https://picsum.photos/seed/werkudara-hero/2400/1500",
      alt: "",
      srcset: [],
      focus: "center" as const,
      text_position: position,
    };
  // The venue photo and the gallery must appear together; ?venue=0 checks the gallery alone.
  const venue = read("venue") === "0"
    ? { venue_image_url: "", venue_image_alt: "", venue_image_credit: "" }
    : { venue_image_url: "https://picsum.photos/seed/werkudara-venue/1600/1000", venue_image_alt: "", venue_image_credit: "Contoh kredit foto" };
  return <EventExperience
    event={{ ...createSeedEvent(), status: "published", hero, ...venue, gallery: sampleGallery.slice(0, count), location_display: read("map") === "0" ? "manual" : "embed", location_embed_url: MAP_EMBED_URL }}
    preview={read("preview") !== "0"}
  />;
}
