import { AdminShell, SetupNotice } from "@/components/admin/shared/AdminShell";
import { PageHeader } from "@/components/console";
import { WamAcaraFrame } from "@/components/admin/wam-acara/WamAcaraFrame";
import { MissionsAdmin } from "@/components/admin/wam-acara/misi/MissionsAdmin";
import { wamAcaraCrumbs } from "@/components/admin/wam-acara/sections";
import { WAM_EVENT_ADMIN_LABEL } from "@/lib/admin-access";
import { isSupabaseConfigured } from "@/lib/server/config";
import { requireAdminPage } from "@/lib/server/admin-session";
import { adminMisi } from "@/lib/server/main-wam/misi/admin";

export const dynamic = "force-dynamic";
export const metadata = { title: `Misi · ${WAM_EVENT_ADMIN_LABEL}` };

/** Admin WAM 2026 → Misi: missions and their points, the proofs people sent, the Peringkat and the settings. */
export default async function MissionsAdminPage() {
  await requireAdminPage();
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  const data = await adminMisi();
  return <WamAcaraFrame current="misi">
    <PageHeader crumbs={wamAcaraCrumbs("misi")} title="Misi" subtitle="Misi foto, check-in lokasi, dan sesi; poin, bukti dari peserta, dan Peringkat. Nyalakan modul Misi di Pengaturan." />
    <MissionsAdmin initial={data} />
  </WamAcaraFrame>;
}
