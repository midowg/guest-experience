import { AdminShell, SetupNotice } from "@/components/admin/shared/AdminShell";
import { RoomsEditor } from "@/components/admin/wam-acara/isi/RoomsEditor";
import { stayLine } from "@/components/admin/wam-acara/isi/stay";
import { WamAcaraFrame } from "@/components/admin/wam-acara/WamAcaraFrame";
import { WAM_EVENT_ADMIN_LABEL } from "@/lib/admin-access";
import { wamAcaraCrumbs } from "@/components/admin/wam-acara/sections";
import { isSupabaseConfigured } from "@/lib/server/config";
import { requireAdminPage } from "@/lib/server/admin-session";
import { adminRooms } from "@/lib/server/main-wam/admin/rooms";
import { readMainWamSettings } from "@/lib/server/main-wam/settings";
import { mainWamAdminPath, wamAdminPath } from "@/lib/routes";

export const dynamic = "force-dynamic";
export const metadata = { title: `Kamar · ${WAM_EVENT_ADMIN_LABEL}` };

/**
 * Admin WAM 2027 → Kamar (agen E, docs/main-wam/KONTRAK.md §6): HR's room pairing with names
 * (who shares with whom), plus lantai and catatan per room. any Admin WAM 2027 admin; the stay answers
 * (Data HR) are not read.
 */
export default async function KamarAdminPage() {
  await requireAdminPage();
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  const [board, settings] = await Promise.all([adminRooms(), readMainWamSettings()]);
  return <WamAcaraFrame current="kamar">
    <RoomsEditor board={board} eventEnd={settings.event.endDate} stay={stayLine(settings.event)} hrRoomsHref={wamAdminPath.questionnaire.rooms} infoHref={mainWamAdminPath.eventInfo}
      crumbs={wamAcaraCrumbs("kamar")} title="Kamar" />
  </WamAcaraFrame>;
}
