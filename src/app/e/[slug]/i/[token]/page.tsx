import { permanentRedirect } from "next/navigation";
import { InvitationPage, eventMetadata } from "@/app/_guest/pages";
import { personal } from "@/app/_guest/find";
import { invitationPath } from "@/lib/routes";
import { getPublicEvent } from "@/lib/server/events";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ slug: string; token: string }> };

export async function generateMetadata({ params }: Params) {
  return eventMetadata(await getPublicEvent((await params).slug).catch(() => null), true);
}

/** Older personal address; moves to /{code}/{short} once both exist. */
export default async function LegacyInvitationPage({ params }: Params) {
  const { slug, token } = await params;
  const { event, invitation } = await personal(slug, token);
  if (event.code && invitation.short_token) permanentRedirect(invitationPath(event, invitation));
  return <InvitationPage event={event} invitation={invitation} />;
}
