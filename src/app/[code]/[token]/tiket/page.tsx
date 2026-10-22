import type { Metadata } from "next";
import { TicketPage } from "@/app/_guest/pages";
import { invitationByCode } from "@/app/_guest/find";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Tiket masuk", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function ShortTicketPage({ params }: { params: Promise<{ code: string; token: string }> }) {
  const { code, token } = await params;
  const { event, invitation } = await invitationByCode(code, token, "/tiket");
  return <TicketPage event={event} invitation={invitation} />;
}
