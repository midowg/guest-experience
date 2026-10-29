import { InvitationPage, eventMetadata } from "@/app/_guest/pages";
import { welcomeEventQuietly, welcomeInvitation } from "@/app/_guest/find";
import { isSupabaseConfigured } from "@/lib/server/config";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ slug: string; token: string }> };

/** The preview names the visit only; the token is not looked up for it. */
export async function generateMetadata({ params }: Params) {
  return eventMetadata(isSupabaseConfigured() ? await welcomeEventQuietly((await params).slug) : null, true);
}

/** /welcome/vortex/k7q2mx9p: one guest's personal link. */
export default async function WelcomeInvitationPage({ params }: Params) {
  const { slug, token } = await params;
  const { event, invitation } = await welcomeInvitation(slug, token);
  return <InvitationPage event={event} invitation={invitation} />;
}
