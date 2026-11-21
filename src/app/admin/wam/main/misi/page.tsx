import { AdminShell, SetupNotice } from "@/components/admin/shared/AdminShell";
import { PageHeader } from "@/components/console";
import { WamAdminFrame } from "@/components/admin/wam/WamAdminFrame";
import { MissionsAdmin } from "@/components/admin/wam/main-wam/misi/MissionsAdmin";
import { wamCrumbs } from "@/components/admin/wam/sections";
import { isSupabaseConfigured } from "@/lib/server/config";
import { requireAdminPage } from "@/lib/server/admin-session";
import { adminMisi } from "@/lib/server/main-wam/misi/admin";

export const dynamic = "force-dynamic";
export const metadata = { title: "Misi · Main WAM · Admin WAM" };

/** Admin WAM → Main WAM → Misi: missions and their points, the proofs people sent, the Peringkat and the settings. */
export default async function MissionsAdminPage() {
  await requireAdminPage();
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  const data = await adminMisi();
  return <WamAdminFrame current="mw-misi">
    <PageHeader crumbs={wamCrumbs("mw-misi")} title="Main WAM · Misi" subtitle="Misi foto, check-in lokasi, dan sesi; poin, bukti dari peserta, dan Peringkat. Nyalakan modul Misi di Pengaturan." />
    <MissionsAdmin initial={data} />
  </WamAdminFrame>;
}
