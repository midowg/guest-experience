import { notFound, permanentRedirect } from "next/navigation";
import { EventPage, eventMetadata, StorageMissing } from "@/app/_guest/pages";
import { eventPath } from "@/lib/routes";
import { getPublicEvent } from "@/lib/server/events";
import { isSupabaseConfigured } from "@/lib/server/config";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params) {
  return eventMetadata(isSupabaseConfigured() ? await getPublicEvent((await params).slug).catch(() => null) : null);
}

/** Older address. Once the event has a short code it moves there; until then it renders here. */
export default async function LegacyEventPage({ params }: Params) {
  if (!isSupabaseConfigured()) return <StorageMissing />;
  const event = await getPublicEvent((await params).slug);
  if (!event) notFound();
  if (event.code) permanentRedirect(eventPath(event));
  return <EventPage event={event} />;
}
