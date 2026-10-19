import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EventExperience } from "@/components/guest/EventExperience";
import { getPublicEvent } from "@/lib/server/events";
import { getPersonalInvitation } from "@/lib/server/invitations";
import { currentPhase } from "@/lib/event-phase";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Undangan personal", robots: { index: false, follow: false }, referrer: "no-referrer" };
type Params = { params: Promise<{ slug: string; token: string }> };

export default async function PersonalInvitationPage({ params }: Params) {
  const { slug, token } = await params;
  const invitation = await getPersonalInvitation(slug, token);
  if (!invitation) notFound();
  const event = await getPublicEvent(slug);
  if (!event || event.invitation_mode !== "personal") notFound();
  return <EventExperience event={event} invitation={invitation} phase={currentPhase(event)} />;
}
