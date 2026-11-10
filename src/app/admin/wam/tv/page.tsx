import { AdminShell, SetupNotice } from "@/components/admin/shared/AdminShell";
import { PraWamTv, type TvAdminView } from "@/components/admin/wam/PraWamTv";
import { WamAdminFrame } from "@/components/admin/wam/WamAdminFrame";
import { wamCrumbs, wamSection } from "@/components/admin/wam/sections";
import { shareUrl } from "@/lib/site-url";
import { isSupabaseConfigured } from "@/lib/server/config";
import { requireAdminPage } from "@/lib/server/admin-session";
import { tvAdmin } from "@/lib/server/pra-wam/tv";

export const dynamic = "force-dynamic";
export const metadata = { title: `${wamSection("tv").label} · Admin WAM` };

const views: Record<TvAdminView, string> = { layar: "Layar TV", tayangan: "Tayangan", tampilan: "Tampilan" };

/**
 * Any admin: TV Announcement in three tabs on its own address. Layar TV: the addresses TVs open.
 * Tayangan (?tab=tayangan): the calendars and the pictures. Tampilan (?tab=tampilan): dark or
 * light, and the QR code.
 */
export default async function WamTvPage({ searchParams }: { searchParams: Promise<{ tab?: string | string[] }> }) {
  await requireAdminPage();
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  const tab = (await searchParams).tab;
  const view: TvAdminView = tab === "tayangan" || tab === "tampilan" ? tab : "layar";
  return <WamAdminFrame current="tv">
    <PraWamTv initial={await tvAdmin()} crumbs={wamCrumbs("tv", views[view])} title={wamSection("tv").label} origin={shareUrl().origin} view={view} />
  </WamAdminFrame>;
}
