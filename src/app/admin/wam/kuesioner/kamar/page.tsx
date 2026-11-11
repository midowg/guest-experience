import { AdminShell, SetupNotice } from "@/components/admin/shared/AdminShell";
import { QuestionnaireFrame } from "@/components/admin/wam/questionnaire/QuestionnaireFrame";
import { StayRooms } from "@/components/admin/wam/questionnaire/StayRooms";
import { Notice } from "@/components/ui";
import { STAY_MIGRATION } from "@/lib/pra-wam/stay";
import { isSupabaseConfigured } from "@/lib/server/config";
import { requireAdminPage } from "@/lib/server/admin-session";
import { hrUnlocked } from "@/lib/server/pra-wam/hr-lock";
import { stayBoard } from "@/lib/server/pra-wam/stay";

export const dynamic = "force-dynamic";
export const metadata = { title: "Kamar · Kuesioner · Admin WAM", robots: { index: false, follow: false } };

/** Any admin (open for every admin since 11 Nov 2026): room pairing from the stay answers. */
export default async function StayRoomsPage() {
  await requireAdminPage();
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  const unlock = await hrUnlocked();
  const board = unlock ? await stayBoard(unlock) : null;
  return <QuestionnaireFrame current="kamar" wide>
    {!unlock
      ? <Notice tone="warning">Kamar belum bisa dibuka. Kuesioner belum ada, atau sesi admin berakhir: muat ulang halaman.</Notice>
      : !board?.migrated
        ? <Notice tone="warning">Kamar menunggu migrasi {STAY_MIGRATION}.</Notice>
        : <StayRooms board={board} />}
  </QuestionnaireFrame>;
}
