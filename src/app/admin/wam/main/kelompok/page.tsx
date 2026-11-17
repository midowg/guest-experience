import { AdminShell, SetupNotice } from "@/components/admin/shared/AdminShell";
import { PageHeader, PageTabs } from "@/components/console";
import { Notice } from "@/components/ui";
import { WamAdminFrame } from "@/components/admin/wam/WamAdminFrame";
import { mainWamContentTabs } from "@/components/admin/wam/main-wam/tabs";
import { wamCrumbs } from "@/components/admin/wam/sections";
import { isSupabaseConfigured } from "@/lib/server/config";
import { requireAdminPage } from "@/lib/server/admin-session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Kelompok · Main WAM · Admin WAM" };

/**
 * Admin WAM → Main WAM → Kelompok. PLACEHOLDER (fondasi): owner agen E, docs/main-wam/KONTRAK.md §6.
 * Kelompok (nomor, nama, koordinator, anggota), terbitkan kelompok, dan kelompok kegiatan per sesi (?tab=kegiatan).
 */
export default async function KelompokAdminPage() {
  await requireAdminPage();
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  return <WamAdminFrame current="mw-kelompok">
    <PageHeader crumbs={wamCrumbs("mw-kelompok")} title="Main WAM · Kelompok" subtitle="Kelompok (nomor, nama, koordinator, anggota), terbitkan kelompok, dan kelompok kegiatan per sesi (?tab=kegiatan)." />
    <PageTabs tabs={mainWamContentTabs} current="kelompok" label="Isi acara" />
    <Notice tone="info">Halaman ini sedang dibangun.</Notice>
  </WamAdminFrame>;
}
