import { AdminShell, SetupNotice } from "@/components/admin/shared/AdminShell";
import { PraWamCarbon } from "@/components/admin/wam/karbon/PraWamCarbon";
import { WamAdminFrame } from "@/components/admin/wam/WamAdminFrame";
import { WAM_ADMIN_LABEL, wamCrumbs, wamSection } from "@/components/admin/wam/sections";
import { isSupabaseConfigured } from "@/lib/server/config";
import { requireAdminPage } from "@/lib/server/admin-session";
import { carbonAdminState } from "@/lib/server/pra-wam/carbon";

export const dynamic = "force-dynamic";
export const metadata = { title: `${wamSection("karbon").label} · ${WAM_ADMIN_LABEL}` };

/** Any admin: Jejak karbon (24 Nov 2026): the group trip, nights and meals, and who travels on their own. */
export default async function WamCarbonPage() {
  await requireAdminPage();
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  return <WamAdminFrame current="karbon" wide>
    <PraWamCarbon initial={await carbonAdminState()} crumbs={wamCrumbs("karbon")} title={wamSection("karbon").label} />
  </WamAdminFrame>;
}
