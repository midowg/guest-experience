import { permanentRedirect } from "next/navigation";
import { ThanksPage, eventMetadata } from "@/app/_guest/pages";
import { personal } from "@/app/_guest/find";
import { thanksPath } from "@/lib/routes";
import { getPublicEvent } from "@/lib/server/events";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ slug: string; token: string }> };

export async function generateMetadata({ params }: Params) {
  return eventMetadata(await getPublicEvent((await params).slug).catch(() => null), true);
}

/** Older personal thank-you address; moves to /{code}/{short}/terima-kasih once both exist. */
export default async function LegacyPersonalThanksPage({ params }: Params) {
  const { slug, token } = await params;
  const { event, invitation } = await personal(slug, token);
  if (event.code && invitation.short_token) permanentRedirect(thanksPath(event, invitation));
  return <ThanksPage event={event} invitation={invitation} />;
}
