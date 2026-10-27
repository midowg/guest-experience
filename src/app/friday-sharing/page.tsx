import { EventPage, eventMetadata, StorageMissing } from "@/app/_guest/pages";
import { isSupabaseConfigured } from "@/lib/server/config";
import { getCurrentFridaySharing } from "@/lib/server/events";

export const dynamic = "force-dynamic";

const current = () => isSupabaseConfigured() ? getCurrentFridaySharing().catch(() => null) : Promise.resolve(null);

export async function generateMetadata() {
  return eventMetadata(await current());
}

/** journey.werkudara.group/friday-sharing: always the latest published Friday Sharing, one link to share every week. */
export default async function FridaySharingPage() {
  if (!isSupabaseConfigured()) return <StorageMissing />;
  const event = await current();
  if (!event) return <main className="container landing"><div className="stack landing-inner">
    <p className="eyebrow">Friday Sharing</p>
    <h1>Belum ada Friday Sharing yang dibuka.</h1>
    <p>Kegiatan berbagi berikutnya akan tampil di sini. Terima kasih sudah mampir.</p>
  </div></main>;
  return <EventPage event={event} />;
}
