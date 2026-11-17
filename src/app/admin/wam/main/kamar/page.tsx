import { AdminShell, SetupNotice } from "@/components/admin/shared/AdminShell";
import { RoomsEditor } from "@/components/admin/wam/main-wam/isi/RoomsEditor";
import { stayLine } from "@/components/admin/wam/main-wam/isi/stay";
import { WamAdminFrame } from "@/components/admin/wam/WamAdminFrame";
import { wamCrumbs } from "@/components/admin/wam/sections";
import { isSupabaseConfigured } from "@/lib/server/config";
import { requireAdminPage } from "@/lib/server/admin-session";
import { adminRooms } from "@/lib/server/main-wam/admin/rooms";
import { readMainWamSettings } from "@/lib/server/main-wam/settings";
import { mainWamAdminPath, wamAdminPath } from "@/lib/routes";

export const dynamic = "force-dynamic";
export const metadata = { title: "Kamar · Main WAM · Admin WAM" };

/**
 * Admin WAM → Main WAM → Kamar (agen E, docs/main-wam/KONTRAK.md §6): HR's room pairing with names
 * (who shares with whom), plus lantai and catatan per room. Any Admin WAM admin; the stay answers
 * (Data HR) are not read.
 */
export default async function KamarAdminPage() {
  await requireAdminPage();
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  const [board, settings] = await Promise.all([adminRooms(), readMainWamSettings()]);
  return <WamAdminFrame current="mw-kamar">
    <RoomsEditor board={board} eventEnd={settings.event.endDate} stay={stayLine(settings.event)} hrRoomsHref={wamAdminPath.questionnaire.rooms} infoHref={mainWamAdminPath.eventInfo}
      crumbs={wamCrumbs("mw-kamar")} title="Main WAM · Kamar" />
  </WamAdminFrame>;
}
