import { AdminShell, SetupNotice } from "@/components/admin/shared/AdminShell";
import { PageHeader } from "@/components/console";
import { StaffAdmin } from "@/components/admin/wam-acara/StaffAdmin";
import { WamAcaraFrame } from "@/components/admin/wam-acara/WamAcaraFrame";
import { wamAcaraCrumbs, wamAcaraSection } from "@/components/admin/wam-acara/sections";
import { WAM_EVENT_ADMIN_LABEL } from "@/lib/admin-access";
import { isSupabaseConfigured } from "@/lib/server/config";
import { requireAdminPage } from "@/lib/server/admin-session";
import { settingsPageOptions } from "@/lib/server/main-wam/settings";
import { listWamStaff } from "@/lib/server/main-wam/staff";

export const dynamic = "force-dynamic";
export const metadata = { title: `Panitia WAM · ${WAM_EVENT_ADMIN_LABEL}` };

/** Admin WAM 2027 → Panitia WAM (20 Nov 2026, KONTRAK §15): the WAM event's committee, apart from Pra WAM's. */
export default async function WamStaffPage() {
  await requireAdminPage();
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  const [board, options] = await Promise.all([listWamStaff(), settingsPageOptions()]);
  return <WamAcaraFrame current="panitia">
    <PageHeader crumbs={wamAcaraCrumbs("panitia")} title={wamAcaraSection("panitia").label}
      subtitle="Panitia acara WAM, dengan seksinya. Terpisah dari panitia Pra WAM: peran Panitia di Admin Pra WAM tidak berlaku di Main WAM." />
    <StaffAdmin initial={board} people={options.people} />
  </WamAcaraFrame>;
}
