import { AdminShell, SetupNotice } from "@/components/admin/shared/AdminShell";
import { PraWamMcp } from "@/components/admin/wam/PraWamMcp";
import { WamAdminFrame } from "@/components/admin/wam/WamAdminFrame";
import { wamCrumbs, wamSection } from "@/components/admin/wam/sections";
import { isSupabaseConfigured } from "@/lib/server/config";
import { requireAdminPage } from "@/lib/server/admin-session";
import { listMcpAccess } from "@/lib/server/pra-wam/mcp";

export const dynamic = "force-dynamic";
export const metadata = { title: `${wamSection("mcp").label} · Admin WAM` };

/** Any admin: who may connect Claude or ChatGPT to WAM, what they may ask about, and the last calls. */
export default async function WamMcpPage() {
  await requireAdminPage();
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  return <WamAdminFrame current="mcp">
    <PraWamMcp initial={await listMcpAccess()} crumbs={wamCrumbs("mcp")} title={wamSection("mcp").label} />
  </WamAdminFrame>;
}
