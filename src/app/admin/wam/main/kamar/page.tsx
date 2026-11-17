import { AdminShell, SetupNotice } from "@/components/admin/shared/AdminShell";
import { PageHeader, PageTabs } from "@/components/console";
import { Notice } from "@/components/ui";
import { WamAdminFrame } from "@/components/admin/wam/WamAdminFrame";
import { mainWamContentTabs } from "@/components/admin/wam/main-wam/tabs";
import { wamCrumbs } from "@/components/admin/wam/sections";
import { isSupabaseConfigured } from "@/lib/server/config";
import { requireAdminPage } from "@/lib/server/admin-session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Kamar · Main WAM · Admin WAM" };

/**
 * Admin WAM → Main WAM → Kamar. PLACEHOLDER (fondasi): owner agen E, docs/main-wam/KONTRAK.md §6.
 * Kamar dari pembagian kamar HR (Kuesioner → Kamar), ditambah lantai dan catatan; hotel, check-in, check-out, kontak kamar.
 */
export default async function KamarAdminPage() {
  await requireAdminPage();
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  return <WamAdminFrame current="mw-kamar">
    <PageHeader crumbs={wamCrumbs("mw-kamar")} title="Main WAM · Kamar" subtitle="Kamar dari pembagian kamar HR (Kuesioner → Kamar), ditambah lantai dan catatan; hotel, check-in, check-out, kontak kamar." />
    <PageTabs tabs={mainWamContentTabs} current="kamar" label="Isi acara" />
    <Notice tone="info">Halaman ini sedang dibangun.</Notice>
  </WamAdminFrame>;
}
