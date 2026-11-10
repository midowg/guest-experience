import { AdminShell, SetupNotice } from "@/components/admin/shared/AdminShell";
import { TvAdminFrame, tvAdminCrumbs, tvAdminLabel } from "@/components/admin/tv/TvAdminFrame";
import { PraWamTv } from "@/components/admin/wam/PraWamTv";
import { shareUrl } from "@/lib/site-url";
import { isSupabaseConfigured } from "@/lib/server/config";
import { requireAdminPage } from "@/lib/server/admin-session";
import { tvAdmin } from "@/lib/server/pra-wam/tv";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tampilan · Admin TV" };

/** Any admin: the board dark or light, and the QR code on it. */
export default async function TvAdminLookPage() {
  await requireAdminPage();
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  return <TvAdminFrame current="tampilan">
    <PraWamTv initial={await tvAdmin()} crumbs={tvAdminCrumbs("tampilan")} title={tvAdminLabel("tampilan")} origin={shareUrl().origin} view="tampilan" standalone />
  </TvAdminFrame>;
}
