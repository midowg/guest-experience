import { AdminShell, SetupNotice } from "@/components/admin/shared/AdminShell";
import { PraWamRooms } from "@/components/admin/wam/PraWamRooms";
import { WamAdminFrame } from "@/components/admin/wam/WamAdminFrame";
import { wamSection } from "@/components/admin/wam/sections";
import { isSupabaseConfigured } from "@/lib/server/config";
import { requireAdminPage } from "@/lib/server/admin-session";
import { listAccounts } from "@/lib/server/pra-wam/accounts";
import { listRooms } from "@/lib/server/pra-wam/appraisal";
import { appSettings } from "@/lib/server/pra-wam/rooms";

export const dynamic = "force-dynamic";
export const metadata = { title: `${wamSection("ruang").label} · Admin WAM` };

/** Any admin: the rooms, the office floor plan, and whether Book shows the plan. */
export default async function WamRoomsPage() {
  await requireAdminPage();
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  // The rooms arrive with the accounts' migration (202611040001); before it there is nothing to list.
  const { migrated } = await listAccounts();
  const [rooms, settings] = await Promise.all([migrated ? listRooms() : [], appSettings()]);
  return <WamAdminFrame current="ruang" wide>
    <PraWamRooms initialRooms={rooms} initialSettings={settings} roomsReady={migrated} />
  </WamAdminFrame>;
}
