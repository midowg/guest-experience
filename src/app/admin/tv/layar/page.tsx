import { AdminShell, SetupNotice } from "@/components/admin/shared/AdminShell";
import { TvAdminFrame, tvAdminCrumbs, tvAdminLabel } from "@/components/admin/tv/TvAdminFrame";
import { PraWamTv } from "@/components/admin/wam/PraWamTv";
import { shareUrl } from "@/lib/site-url";
import { isSupabaseConfigured } from "@/lib/server/config";
import { requireAdminPage } from "@/lib/server/admin-session";
import { tvAdmin } from "@/lib/server/pra-wam/tv";

export const dynamic = "force-dynamic";
export const metadata = { title: "Layar TV · Admin TV" };

/** Any admin: the one address for every TV, and each TV's own address (add, rename its address, remove). */
export default async function TvAdminScreensPage() {
  await requireAdminPage();
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  return <TvAdminFrame current="layar">
    <PraWamTv initial={await tvAdmin()} crumbs={tvAdminCrumbs("layar")} title={tvAdminLabel("layar")} origin={shareUrl().origin} view="layar" standalone />
  </TvAdminFrame>;
}
