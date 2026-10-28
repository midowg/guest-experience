import { EventPage, eventMetadata, StorageMissing } from "@/app/_guest/pages";
import { isSupabaseConfigured } from "@/lib/server/config";
import { getCurrentPlaceGuide } from "@/lib/server/events";

export const dynamic = "force-dynamic";

const current = () => isSupabaseConfigured() ? getCurrentPlaceGuide().catch(() => null) : Promise.resolve(null);

export async function generateMetadata() {
  return eventMetadata(await current());
}

/** journey.werkudara.group/your-visit: always the published Panduan lokasi, one link to share with every guest. */
export default async function YourVisitPage() {
  if (!isSupabaseConfigured()) return <StorageMissing />;
  const event = await current();
  if (!event) return <main className="container landing"><div className="stack landing-inner">
    <p className="eyebrow">Your Visit</p>
    <h1>Panduan kunjungan belum dibuka.</h1>
    <p>Hubungi tim Werkudara untuk petunjuk menuju lokasi. Terima kasih.</p>
  </div></main>;
  return <EventPage event={event} />;
}
