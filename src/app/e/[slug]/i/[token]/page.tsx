import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EventExperience } from "@/components/guest/EventExperience";
import { getPublicEvent } from "@/lib/server/events";
import { getPersonalInvitation } from "@/lib/server/invitations";
import { currentPhase } from "@/lib/event-phase";
import { formatDate } from "@/lib/format";
import { rsvpNeedsReady } from "@/lib/server/responses";
import { afterPhotos } from "@/lib/server/gallery";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ slug: string; token: string }> };

/**
 * The preview names the event only: the guest's name never goes into the title or the card, so a
 * forwarded link shows nothing personal. The token is not looked up here.
 */
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const base: Metadata = { title: "Undangan personal", robots: { index: false, follow: false }, referrer: "no-referrer" };
  const event = await getPublicEvent((await params).slug).catch(() => null);
  if (!event) return base;
  const description = `${formatDate(event.starts_at, event.timezone)}${event.venue_name ? ` · ${event.venue_name}` : ""}`;
  return { ...base, title: event.title, description, openGraph: { title: event.title, description, type: "website", siteName: "Werkudara" } };
}

export default async function PersonalInvitationPage({ params }: Params) {
  const { slug, token } = await params;
  const invitation = await getPersonalInvitation(slug, token);
  if (!invitation) notFound();
  const event = await getPublicEvent(slug);
  if (!event || event.invitation_mode !== "personal") notFound();
  return <EventExperience event={event} invitation={invitation} phase={currentPhase(event)} rsvpNeeds={await rsvpNeedsReady()} photoCount={await afterPhotos(event)} />;
}
