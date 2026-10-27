import { notFound, permanentRedirect } from "next/navigation";
import { ThanksPage, eventMetadata, StorageMissing } from "@/app/_guest/pages";
import { thanksPath } from "@/lib/routes";
import { getPublicEvent } from "@/lib/server/events";
import { isSupabaseConfigured } from "@/lib/server/config";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params) {
  return eventMetadata(isSupabaseConfigured() ? await getPublicEvent((await params).slug).catch(() => null) : null);
}

/** Older address of the thank-you page; moves to /{code}/terima-kasih once the event has a code. */
export default async function LegacyThanksPage({ params }: Params) {
  if (!isSupabaseConfigured()) return <StorageMissing />;
  const event = await getPublicEvent((await params).slug);
  if (!event) notFound();
  if (event.code) permanentRedirect(thanksPath(event));
  return <ThanksPage event={event} />;
}
