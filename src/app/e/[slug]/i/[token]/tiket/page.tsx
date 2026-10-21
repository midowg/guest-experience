import type { Metadata } from "next";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { TicketView, type TicketData } from "@/components/guest/TicketView";
import { ticketScanUrl } from "@/lib/tickets";
import { siteUrl } from "@/lib/site-url";
import { getPublicEvent } from "@/lib/server/events";
import { getPersonalInvitation } from "@/lib/server/invitations";
import { ensureTicket } from "@/lib/server/tickets";
import { absolute, invitationPath, ticketPath } from "@/lib/routes";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Tiket masuk", robots: { index: false, follow: false }, referrer: "no-referrer" };
type Params = { params: Promise<{ slug: string; token: string }> };

/** The guest's entry ticket on their personal link. Issued the first time it is opened after a yes. */
export default async function TicketPage({ params }: Params) {
  const { slug, token } = await params;
  const invitation = await getPersonalInvitation(slug, token);
  if (!invitation) notFound();
  const event = await getPublicEvent(slug);
  if (!event) notFound();
  if (invitation.rsvp?.attendance !== "yes") return <TicketView event={event} ticket={null} reason="not-attending" />;
  const ticket = await ensureTicket(invitation.rsvp.id);
  if (!ticket) return <TicketView event={event} ticket={null} reason="unavailable" />;
  const origin = siteUrl().origin;
  const scan = ticketScanUrl(origin, ticket.code);
  const options = { errorCorrectionLevel: "M" as const, margin: 1, color: { dark: "#111111", light: "#ffffff" } };
  const data: TicketData = {
    name: invitation.rsvp.name || invitation.name,
    partySize: Math.max(1, invitation.rsvp.party_size ?? 1),
    qrSvg: await QRCode.toString(scan, { ...options, type: "svg" }),
    qrPng: await QRCode.toDataURL(scan, { ...options, width: 600 }),
    pageUrl: absolute(origin, ticketPath(event, { token })),
    backUrl: invitationPath(event, { token }),
  };
  return <TicketView event={event} ticket={data} reason="ready" />;
}
