import { notFound } from "next/navigation";
import { EventExperience } from "@/components/guest/EventExperience";
import { smTdnYogyakarta } from "@/lib/fixtures/sm-tdn-yogyakarta";
import { getPublicEventByCode } from "@/lib/server/events";
import type { EventLanguage, EventPhase, EventRecord, PlainImage } from "@/lib/types";

export const dynamic = "force-dynamic";

const sample = (seed: string, width: number, height: number, alt: string): PlainImage => ({ url: `https://picsum.photos/seed/${seed}/${width}/${height}`, alt, srcset: [] });

/** Sample photos on every highlight (one to three) and every day's banner, so the layout can be checked without the real ones. */
function withSamples(event: EventRecord, on: boolean): EventRecord {
  if (!on) return event;
  const details = Object.fromEntries(Object.entries(event.agenda_details).map(([key, detail], index) => detail.points?.length || detail.note
    ? [key, { ...detail, photo: sample(`sm-${index}`, 1200, 900, `Contoh foto ${index + 1}`), photos: Array.from({ length: index % 3 }, (_, at) => sample(`sm-${index}-${at}`, 1200, 800, `Contoh foto ${index + 1}.${at + 1}`)) }]
    : [key, detail]));
  return { ...event, agenda_details: details, trip: { ...event.trip, day_covers: event.trip.day_covers.map((cover, index) => ({ ...cover, image: sample(`day-${index}`, 1440, 600, `Contoh banner hari ${index + 1}`) })) } };
}

/** Layout check for the Handbook trip template with the Surya Madistrindo data. ?phase=day|after shows the other phases; ?lang=en|id_en the English page;
 * ?code=SMTDN6 a published event as it is now (read-only), to check its photos and layout; ?samples=1 gives the
 * fixture's place highlights and days sample photos, to check the photo row and the sheet. */
export default async function DevHandbookPage({ searchParams }: { searchParams: Promise<{ phase?: string; lang?: string; code?: string; samples?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { phase, lang, code, samples } = await searchParams;
  const published = code ? await getPublicEventByCode(code.toUpperCase()) : null;
  const base = published ?? withSamples(smTdnYogyakarta(), samples === "1");
  const language = (["id", "en", "id_en"] as EventLanguage[]).find(value => value === lang) ?? base.language;
  return <EventExperience event={{ ...base, language }} preview phase={(["before", "day", "after"] as EventPhase[]).find(value => value === phase) ?? "before"} />;
}
