import { notFound } from "next/navigation";
import { HR_SUB_TABS, hrTabLabels, hrTabPaths } from "@/lib/hr/tabs";
import { HrScreen } from "../HrScreen";

export const dynamic = "force-dynamic";

const isTab = (tab: string): tab is (typeof HR_SUB_TABS)[number] => (HR_SUB_TABS as readonly string[]).includes(tab);

export async function generateMetadata({ params }: { params: Promise<{ tab: string }> }) {
  const { tab } = await params;
  return { title: isTab(tab) ? hrTabLabels[tab] : "Tidak ditemukan" };
}

/** Riwayat, Pengajuan, Profil (21 Nov 2026): the same app as Beranda, opened at that place. */
export default async function HrTabPage({ params }: { params: Promise<{ tab: string }> }) {
  const { tab } = await params;
  if (!isTab(tab)) notFound();
  return <HrScreen here={hrTabPaths[tab]} />;
}
