import { AnnounceForm } from "@/components/main-wam/panitia/AnnounceForm";
import { mainWamPath } from "@/lib/routes";
import { requireActionPage } from "@/lib/server/main-wam/gate";
import { announceData } from "@/lib/server/main-wam/panitia/announce";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pengumuman baru · WAM", robots: { index: false } };

/** K06 Kirim pengumuman (a task screen: ✕ and Kirim at the bottom). Panitia and Admin WAM only. */
export default async function PengumumanPage() {
  const context = await requireActionPage("kelola", mainWamPath.announce);
  const data = await announceData(context);
  return <AnnounceForm {...data} now={new Date().toISOString()} />;
}
