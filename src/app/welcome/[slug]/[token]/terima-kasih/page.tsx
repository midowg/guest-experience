import { ThanksPage, eventMetadata } from "@/app/_guest/pages";
import { welcomeEventQuietly, welcomeInvitation } from "@/app/_guest/find";
import { isSupabaseConfigured } from "@/lib/server/config";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ slug: string; token: string }> };

export async function generateMetadata({ params }: Params) {
  return eventMetadata(isSupabaseConfigured() ? await welcomeEventQuietly((await params).slug) : null, true);
}

/** /welcome/vortex/k7q2mx9p/terima-kasih: the thank-you page, greeting one guest by name. */
export default async function WelcomePersonalThanksPage({ params }: Params) {
  const { slug, token } = await params;
  const { event, invitation } = await welcomeInvitation(slug, token);
  return <ThanksPage event={event} invitation={invitation} />;
}
