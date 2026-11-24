import { AdminShell, SetupNotice } from "@/components/admin/shared/AdminShell";
import { PraWamMission } from "@/components/admin/wam/PraWamMission";
import { WamAdminFrame } from "@/components/admin/wam/WamAdminFrame";
import { WAM_ADMIN_LABEL, wamCrumbs, wamSection } from "@/components/admin/wam/sections";
import { isSupabaseConfigured } from "@/lib/server/config";
import { requireAdminPage } from "@/lib/server/admin-session";
import { missionAdminState } from "@/lib/server/pra-wam/mission-admin";

export const dynamic = "force-dynamic";
export const metadata = { title: `${wamSection("misi").label} · ${WAM_ADMIN_LABEL}` };

/** Any admin: Misi Perjalanan (24 Nov 2026), the rooms, the HoD in them with quiz hints, and the BoD. */
export default async function WamMissionPage() {
  await requireAdminPage();
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  return <WamAdminFrame current="misi" wide>
    <PraWamMission initial={await missionAdminState()} crumbs={wamCrumbs("misi")} title={wamSection("misi").label} />
  </WamAdminFrame>;
}
