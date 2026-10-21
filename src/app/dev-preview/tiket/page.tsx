import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { TicketView } from "@/components/guest/TicketView";
import { createSeedEvent } from "@/lib/seed-event";
import { ticketScanUrl } from "@/lib/tickets";

export const dynamic = "force-dynamic";

/** Layout check for the guest ticket with a sample code. ?tidak=1 shows the "not attending" state. */
export default async function DevTicketPage({ searchParams }: { searchParams: Promise<{ tidak?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const event = createSeedEvent();
  if ((await searchParams).tidak === "1") return <TicketView event={event} ticket={null} reason="not-attending" />;
  const scan = ticketScanUrl("http://localhost:3000", "ContohKodeTiketContoh0");
  return <TicketView event={event} reason="ready" ticket={{
    name: "Contoh Tamu Satu", partySize: 2,
    qrSvg: await QRCode.toString(scan, { type: "svg", margin: 1 }), qrPng: await QRCode.toDataURL(scan, { width: 600, margin: 1 }),
    pageUrl: "http://localhost:3000/dev-preview/tiket", backUrl: "/dev-preview",
  }} />;
}
