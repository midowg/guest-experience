import { AdminShell, SetupNotice } from "@/components/admin/shared/AdminShell";
import { TvAdminFrame, tvAdminCrumbs, tvAdminLabel } from "@/components/admin/tv/TvAdminFrame";
import { TvMonitor } from "@/components/admin/tv/TvMonitor";
import { shareUrl } from "@/lib/site-url";
import { isSupabaseConfigured } from "@/lib/server/config";
import { requireAdminPage } from "@/lib/server/admin-session";
import { tvAdmin } from "@/lib/server/pra-wam/tv";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pantauan · Admin TV" };

/** Admin TV's first page, for any admin: which TV is on, what it shows, and a way to reload it from here. */
export default async function TvAdminHomePage() {
  await requireAdminPage();
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  return <TvAdminFrame current="pantauan">
    <TvMonitor initial={await tvAdmin()} crumbs={tvAdminCrumbs("pantauan")} title={tvAdminLabel("pantauan")} origin={shareUrl().origin} />
  </TvAdminFrame>;
}
