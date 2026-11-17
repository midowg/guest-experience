import { AdminShell, SetupNotice } from "@/components/admin/shared/AdminShell";
import { PageHeader, PageTabs } from "@/components/console";
import { Notice } from "@/components/ui";
import { WamAdminFrame } from "@/components/admin/wam/WamAdminFrame";
import { mainWamContentTabs } from "@/components/admin/wam/main-wam/tabs";
import { wamCrumbs } from "@/components/admin/wam/sections";
import { isSupabaseConfigured } from "@/lib/server/config";
import { requireAdminPage } from "@/lib/server/admin-session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Perjalanan · Main WAM · Admin WAM" };

/**
 * Admin WAM → Main WAM → Perjalanan. PLACEHOLDER (fondasi): owner agen E, docs/main-wam/KONTRAK.md §6.
 * Langkah berangkat dan pulang (kumpul, kereta, bus, tiba), kursi atau kendaraan tiap orang, km dan jumlah bus untuk Jejak karbon.
 */
export default async function PerjalananAdminPage() {
  await requireAdminPage();
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  return <WamAdminFrame current="mw-perjalanan">
    <PageHeader crumbs={wamCrumbs("mw-perjalanan")} title="Main WAM · Perjalanan" subtitle="Langkah berangkat dan pulang (kumpul, kereta, bus, tiba), kursi atau kendaraan tiap orang, km dan jumlah bus untuk Jejak karbon." />
    <PageTabs tabs={mainWamContentTabs} current="perjalanan" label="Isi acara" />
    <Notice tone="info">Halaman ini sedang dibangun.</Notice>
  </WamAdminFrame>;
}
