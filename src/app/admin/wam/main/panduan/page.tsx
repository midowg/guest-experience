import { AdminShell, SetupNotice } from "@/components/admin/shared/AdminShell";
import { PageHeader, PageTabs } from "@/components/console";
import { Notice } from "@/components/ui";
import { WamAdminFrame } from "@/components/admin/wam/WamAdminFrame";
import { mainWamContentTabs } from "@/components/admin/wam/main-wam/tabs";
import { wamCrumbs } from "@/components/admin/wam/sections";
import { isSupabaseConfigured } from "@/lib/server/config";
import { requireAdminPage } from "@/lib/server/admin-session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Panduan · Main WAM · Admin WAM" };

/**
 * Admin WAM → Main WAM → Panduan. PLACEHOLDER (fondasi): owner agen E, docs/main-wam/KONTRAK.md §6.
 * Denah venue, Hotel & fasilitas, Dress code per hari, Tata tertib: teks dan berkas (gambar atau PDF) di penyimpanan privat.
 */
export default async function PanduanAdminPage() {
  await requireAdminPage();
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  return <WamAdminFrame current="mw-panduan">
    <PageHeader crumbs={wamCrumbs("mw-panduan")} title="Main WAM · Panduan" subtitle="Denah venue, Hotel & fasilitas, Dress code per hari, Tata tertib: teks dan berkas (gambar atau PDF) di penyimpanan privat." />
    <PageTabs tabs={mainWamContentTabs} current="panduan" label="Isi acara" />
    <Notice tone="info">Halaman ini sedang dibangun.</Notice>
  </WamAdminFrame>;
}
