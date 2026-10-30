import { InvitationPage, eventMetadata } from "@/app/_guest/pages";
import { eventByCodeQuietly, invitationByCode } from "@/app/_guest/find";
import { isSupabaseConfigured } from "@/lib/server/config";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ code: string; token: string }> };

/** The preview names the event only; the token is not looked up for it. */
export async function generateMetadata({ params }: Params) {
  return eventMetadata(isSupabaseConfigured() ? await eventByCodeQuietly((await params).code) : null, true);
}

/** journey.werkudara.group/AB23CD/k7q2mx9p: one guest's invitation. */
export default async function ShortInvitationPage({ params }: Params) {
  const { code, token } = await params;
  const { event, invitation } = await invitationByCode(code, token);
  return <InvitationPage event={event} invitation={invitation} />;
}
