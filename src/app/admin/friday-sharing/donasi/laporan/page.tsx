import type { Metadata } from "next";
import DonationReportPage from "../../../acara/[ref]/donasi/laporan/page";
import { fridaySharingParams } from "../../current";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Cetak laporan donasi", robots: { index: false, follow: false } };

/** /admin/friday-sharing/donasi/laporan: the printed handover report. */
export default async function FridaySharingReportPage({ searchParams }: { searchParams: Promise<{ penerima?: string }> }) {
  return DonationReportPage({ params: fridaySharingParams(), searchParams });
}
