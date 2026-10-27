import { ThanksPage, eventMetadata } from "@/app/_guest/pages";
import { eventByCodeQuietly, invitationByCode } from "@/app/_guest/find";
import { isSupabaseConfigured } from "@/lib/server/config";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ code: string; token: string }> };

export async function generateMetadata({ params }: Params) {
  return eventMetadata(isSupabaseConfigured() ? await eventByCodeQuietly((await params).code) : null, true);
}

/** invitation.werkudara.group/AB23CD/k7q2mx9p/terima-kasih: the thank-you page, greeting one guest by name. */
export default async function ShortPersonalThanksPage({ params }: Params) {
  const { code, token } = await params;
  const { event, invitation } = await invitationByCode(code, token, "/terima-kasih");
  return <ThanksPage event={event} invitation={invitation} />;
}
