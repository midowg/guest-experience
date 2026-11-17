import { AdminShell, SetupNotice } from "@/components/admin/shared/AdminShell";
import { PageHeader, PageTabs } from "@/components/console";
import { Notice } from "@/components/ui";
import { WamAdminFrame } from "@/components/admin/wam/WamAdminFrame";
import { mainWamContentTabs } from "@/components/admin/wam/main-wam/tabs";
import { wamCrumbs } from "@/components/admin/wam/sections";
import { isSupabaseConfigured } from "@/lib/server/config";
import { requireAdminPage } from "@/lib/server/admin-session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Rundown · Main WAM · Admin WAM" };

/**
 * Admin WAM → Main WAM → Rundown. PLACEHOLDER (fondasi): owner agen E, docs/main-wam/KONTRAK.md §6.
 * Sesi rundown 4 hari: jam, tempat, dresscode, yang perlu dibawa, urutan tampil, konsumsi, kontak panitia, pakai absen, wajib, modul sesi; terbit atau draf.
 */
export default async function RundownAdminPage() {
  await requireAdminPage();
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  return <WamAdminFrame current="mw-isi">
    <PageHeader crumbs={wamCrumbs("mw-isi")} title="Main WAM · Rundown" subtitle="Sesi rundown 4 hari: jam, tempat, dresscode, yang perlu dibawa, urutan tampil, konsumsi, kontak panitia, pakai absen, wajib, modul sesi; terbit atau draf." />
    <PageTabs tabs={mainWamContentTabs} current="rundown" label="Isi acara" />
    <Notice tone="info">Halaman ini sedang dibangun.</Notice>
  </WamAdminFrame>;
}
