import { AdminShell, SetupNotice } from "@/components/admin/shared/AdminShell";
import { PraWamEvents } from "@/components/admin/wam/PraWamEvents";
import { WamAdminFrame } from "@/components/admin/wam/WamAdminFrame";
import { wamSection } from "@/components/admin/wam/sections";
import { isSupabaseConfigured } from "@/lib/server/config";
import { requireAdminPage } from "@/lib/server/admin-session";
import { listEvents } from "@/lib/server/pra-wam/events";

export const dynamic = "force-dynamic";
export const metadata = { title: `${wamSection("acara").label} · Admin WAM` };

/** Any admin: Pra WAM and WAM, their status and the modules they open. */
export default async function WamEventsPage() {
  await requireAdminPage();
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  const { events, migrated } = await listEvents();
  return <WamAdminFrame current="acara">
    <PraWamEvents initial={events} migrated={migrated} />
  </WamAdminFrame>;
}
