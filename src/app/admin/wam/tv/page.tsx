import { AdminShell, SetupNotice } from "@/components/admin/shared/AdminShell";
import { PraWamTv } from "@/components/admin/wam/PraWamTv";
import { WamAdminFrame } from "@/components/admin/wam/WamAdminFrame";
import { wamCrumbs, wamSection } from "@/components/admin/wam/sections";
import { isSupabaseConfigured } from "@/lib/server/config";
import { requireAdminPage } from "@/lib/server/admin-session";
import { tvAdmin } from "@/lib/server/pra-wam/tv";

export const dynamic = "force-dynamic";
export const metadata = { title: `${wamSection("tv").label} · Admin WAM` };

/** Any admin: the office TVs and their addresses, the pictures they play, and the schedule's settings. */
export default async function WamTvPage() {
  await requireAdminPage();
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  return <WamAdminFrame current="tv">
    <PraWamTv initial={await tvAdmin()} crumbs={wamCrumbs("tv")} title={wamSection("tv").label} />
  </WamAdminFrame>;
}
