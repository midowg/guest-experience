import { EventPage, eventMetadata, StorageMissing } from "@/app/_guest/pages";
import { eventByCodeQuietly, fridaySharingByCode } from "@/app/_guest/find";
import { isSupabaseConfigured } from "@/lib/server/config";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ code: string }> };

export async function generateMetadata({ params }: Params) {
  const event = isSupabaseConfigured() ? await eventByCodeQuietly((await params).code) : null;
  return eventMetadata(event?.event_kind === "csr" ? event : null);
}

/** journey.werkudara.group/friday-sharing/AB23CD: one Friday Sharing, for admin links and the news to its donors. */
export default async function FridaySharingEventPage({ params }: Params) {
  if (!isSupabaseConfigured()) return <StorageMissing />;
  return <EventPage event={await fridaySharingByCode((await params).code)} />;
}
