import { ThanksPage, eventMetadata, StorageMissing } from "@/app/_guest/pages";
import { welcomeEvent, welcomeEventQuietly } from "@/app/_guest/find";
import { isSupabaseConfigured } from "@/lib/server/config";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params) {
  return eventMetadata(isSupabaseConfigured() ? await welcomeEventQuietly((await params).slug) : null);
}

/** /welcome/vortex/terima-kasih: the thank-you page the host sends after the visit. */
export default async function WelcomeThanksPage({ params }: Params) {
  if (!isSupabaseConfigured()) return <StorageMissing />;
  return <ThanksPage event={await welcomeEvent((await params).slug)} />;
}
