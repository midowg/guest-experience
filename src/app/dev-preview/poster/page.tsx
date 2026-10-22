import { notFound } from "next/navigation";
import { PosterPage } from "@/components/poster/PosterPage";
import { presetPoster } from "@/lib/poster-presets";
import { createSeedEvent } from "@/lib/seed-event";

export const dynamic = "force-dynamic";

/**
 * Layout check for Studio Poster with the JCWF example ("Meramu Rempah Nusantara"). Nothing is
 * saved anywhere; the draft stays in this browser. ?kosong=1 starts without the event's values.
 */
export default async function DevPosterPage({ searchParams }: { searchParams: Promise<{ kosong?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const empty = (await searchParams).kosong === "1";
  const event = {
    ...createSeedEvent(), id: "10f3a511-2331-4000-8000-0000000000ff", title: "JCWF 2026",
    theme: { key: "rempah" as const, corners: "square" as const },
    starts_at: "2026-11-07T04:30:00.000Z", ends_at: "2026-11-07T05:30:00.000Z", timezone: "Asia/Jakarta", venue_name: empty ? "" : "Loman Park Hotel\nYogyakarta",
  };
  const poster = presetPoster("rempah-nusantara", event);
  poster.fields = poster.fields.map(field =>
    field.key === "reservation" ? { ...field, value: "Reservasi & informasi\natourin.com/en/jcwf2026" }
    : field.key === "socials" ? { ...field, value: "@jcwf.id | jcwf.id" }
    : empty && field.editable ? { ...field, value: "" } : field);
  return <PosterPage event={{ ...event, poster }} />;
}
