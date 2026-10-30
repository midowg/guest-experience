import { EventPage, eventMetadata, StorageMissing } from "@/app/_guest/pages";
import { welcomeEvent, welcomeEventQuietly } from "@/app/_guest/find";
import { isSupabaseConfigured } from "@/lib/server/config";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params) {
  return eventMetadata(isSupabaseConfigured() ? await welcomeEventQuietly((await params).slug) : null);
}

/** journey.werkudara.group/welcome/vortex: a Welcome visit's page for its guests. */
export default async function WelcomePage({ params }: Params) {
  if (!isSupabaseConfigured()) return <StorageMissing />;
  return <EventPage event={await welcomeEvent((await params).slug)} />;
}
