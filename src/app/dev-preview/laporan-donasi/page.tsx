import { notFound } from "next/navigation";
import { DonationReportSheet } from "@/components/admin/donations/DonationReportSheet";
import { donationReport } from "@/lib/donations";
import { sampleCsr } from "../csr/sample";

export const dynamic = "force-dynamic";

/** Layout check for the printed donation handover report, with the made-up donations of /dev-preview/csr. ?serah=1 handed over. */
export default async function DevDonationReportPage({ searchParams }: { searchParams: Promise<{ kosong?: string; serah?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { event, donation, records } = sampleCsr(await searchParams);
  return <DonationReportSheet event={{ id: event.id, title: event.title, organizer: event.organizer, timezone: event.timezone, donation, contactName: event.contact.name }} report={donationReport(donation, records)} initialRecipient="" printedAt="2026-10-27T09:00:00.000Z" />;
}
