import { notFound } from "next/navigation";
import { PlaceGuide } from "@/components/guest/PlaceGuide";
import { samplePlaceGuide } from "./sample";

export const dynamic = "force-dynamic";

/** Layout check for a Panduan lokasi as "Buat acara" makes it. ?kosong=1 without map, steps and gallery. */
export default async function DevPlaceGuidePage({ searchParams }: { searchParams: Promise<{ kosong?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const query = await searchParams;
  const event = samplePlaceGuide();
  return <PlaceGuide event={query.kosong === "1" ? { ...event, gallery: [], route: { map_image: { url: "", alt: "", srcset: [] }, steps: [], points: [] } } : event} />;
}
