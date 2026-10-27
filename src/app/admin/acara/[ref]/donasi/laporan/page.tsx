import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DonationReportSheet } from "@/components/admin/donations/DonationReportSheet";
import { SetupNotice } from "@/components/admin/shared/AdminShell";
import { donationReport } from "@/lib/donations";
import { getAdminEvent, resolveEventRef } from "@/lib/server/events";
import { listDonations } from "@/lib/server/donations";
import { isSupabaseConfigured } from "@/lib/server/config";
import { requireAdminPage, requireEventPage } from "@/lib/server/admin-session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Cetak laporan donasi", robots: { index: false, follow: false } };

/**
 * A4 handover report for a Friday Sharing (CSR) event: what was collected (received donations only)
 * and who gave, to hand to the recipient. ?penerima=<id> addresses it to one recipient. No admin
 * header, so it prints clean.
 */
export default async function DonationReportPage({ params, searchParams }: { params: Promise<{ ref: string }>; searchParams: Promise<{ penerima?: string }> }) {
  await requireAdminPage();
  if (!isSupabaseConfigured()) return <SetupNotice />;
  const id = await resolveEventRef((await params).ref);
  if (!id) notFound();
  await requireEventPage(id);
  const event = await getAdminEvent(id);
  if (!event || event.event_kind !== "csr") notFound();
  const { donations } = await listDonations(id);
  const recipient = (await searchParams).penerima ?? "";
  return <DonationReportSheet
    event={{ id: event.id, title: event.title, organizer: event.organizer, timezone: event.timezone, donation: event.donation }}
    report={donationReport(event.donation, donations)}
    initialRecipient={event.donation.recipients.some(item => item.id === recipient) ? recipient : ""}
    printedAt={new Date().toISOString()} />;
}
