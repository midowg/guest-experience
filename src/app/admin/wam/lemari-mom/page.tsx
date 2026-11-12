import { AdminShell, SetupNotice } from "@/components/admin/shared/AdminShell";
import { PraWamMomCabinet } from "@/components/admin/wam/PraWamMomCabinet";
import { WamAdminFrame } from "@/components/admin/wam/WamAdminFrame";
import { wamCrumbs, wamSection } from "@/components/admin/wam/sections";
import { isSupabaseConfigured } from "@/lib/server/config";
import { requireAdminPage } from "@/lib/server/admin-session";
import { momCabinet } from "@/lib/server/pra-wam/mom-cabinet";

export const dynamic = "force-dynamic";
export const metadata = { title: `${wamSection("lemari").label} · Admin WAM` };

/** Any admin (12 Nov 2026): every sent MoM with its PDF and photos, in folders, with exports. */
export default async function WamMomCabinetPage() {
  await requireAdminPage();
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  return <WamAdminFrame current="lemari">
    <PraWamMomCabinet initial={await momCabinet()} crumbs={wamCrumbs("lemari")} />
  </WamAdminFrame>;
}
