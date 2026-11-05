import { AdminShell, SetupNotice } from "@/components/admin/shared/AdminShell";
import { PraWamAbout } from "@/components/admin/wam/PraWamAbout";
import { WamAdminFrame } from "@/components/admin/wam/WamAdminFrame";
import { wamCrumbs, wamSection } from "@/components/admin/wam/sections";
import { isSupabaseConfigured } from "@/lib/server/config";
import { requireAdminPage } from "@/lib/server/admin-session";
import { getAbout } from "@/lib/server/pra-wam/about";

export const dynamic = "force-dynamic";
export const metadata = { title: `${wamSection("about").label} · Admin WAM` };

/** Any admin: the "Apa itu WAM?" text on Beranda, with a preview. */
export default async function WamAboutPage() {
  await requireAdminPage();
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  return <WamAdminFrame current="about" wide>
    <PraWamAbout initial={await getAbout()} crumbs={wamCrumbs("about")} title={wamSection("about").label} />
  </WamAdminFrame>;
}
