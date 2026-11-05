import { Lock } from "lucide-react";
import { AdminShell, SetupNotice } from "@/components/admin/shared/AdminShell";
import { QuestionnaireTabs } from "@/components/admin/wam/questionnaire/QuestionnaireTabs";
import { StayRooms } from "@/components/admin/wam/questionnaire/StayRooms";
import { WamAdminFrame } from "@/components/admin/wam/WamAdminFrame";
import { Notice } from "@/components/ui";
import { STAY_MIGRATION } from "@/lib/pra-wam/stay";
import { wamAdminPath } from "@/lib/routes";
import { isSupabaseConfigured } from "@/lib/server/config";
import { requireAdminPage } from "@/lib/server/admin-session";
import { hrUnlocked } from "@/lib/server/pra-wam/hr-lock";
import { stayBoard } from "@/lib/server/pra-wam/stay";

export const dynamic = "force-dynamic";
export const metadata = { title: "Kamar · Kuesioner · Admin WAM", robots: { index: false, follow: false } };

/**
 * Any admin, then Data HR open in this browser: room pairing from the stay answers. Locked, the
 * page holds no names or answers at all, only the way to Data HR.
 */
export default async function StayRoomsPage() {
  await requireAdminPage();
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  const unlock = await hrUnlocked();
  const board = unlock ? await stayBoard(unlock) : null;
  return <WamAdminFrame current="kuesioner" wide>
    <QuestionnaireTabs current="kamar" />
    {!unlock
      ? <Notice tone="info"><Lock size={14} aria-hidden /> Pairing kamar memakai data menginap, jadi terkunci seperti Data HR. <a href={wamAdminPath.questionnaire.hrData}>Buka Data HR</a> dengan email WAM yang punya akses, lalu kembali ke sini.</Notice>
      : !board?.migrated
        ? <Notice tone="warning">Kamar menunggu migrasi {STAY_MIGRATION}.</Notice>
        : <StayRooms board={board} />}
  </WamAdminFrame>;
}
