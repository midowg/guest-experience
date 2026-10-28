import { EventPage, eventMetadata, StorageMissing } from "@/app/_guest/pages";
import { eventByCode, eventByCodeQuietly, sendToFixedAddress } from "@/app/_guest/find";
import { isSupabaseConfigured } from "@/lib/server/config";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ code: string }> };

export async function generateMetadata({ params }: Params) {
  return eventMetadata(isSupabaseConfigured() ? await eventByCodeQuietly((await params).code) : null);
}

/** invitation.werkudara.group/AB23CD: the general invitation page. */
export default async function ShortEventPage({ params }: Params) {
  if (!isSupabaseConfigured()) return <StorageMissing />;
  return <EventPage event={sendToFixedAddress(await eventByCode((await params).code))} />;
}
