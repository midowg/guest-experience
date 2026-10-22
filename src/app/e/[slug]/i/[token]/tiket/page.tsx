import type { Metadata } from "next";
import { permanentRedirect } from "next/navigation";
import { TicketPage } from "@/app/_guest/pages";
import { personal } from "@/app/_guest/find";
import { ticketPath } from "@/lib/routes";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Tiket masuk", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function LegacyTicketPage({ params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await params;
  const { event, invitation } = await personal(slug, token);
  if (event.code && invitation.short_token) permanentRedirect(ticketPath(event, invitation));
  return <TicketPage event={event} invitation={invitation} />;
}
