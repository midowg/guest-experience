import { AbsenManual } from "@/components/main-wam/panitia/AbsenManual";
import { mainWamPath } from "@/lib/routes";
import { requireActionPage } from "@/lib/server/main-wam/gate";
import { attendanceData } from "@/lib/server/main-wam/panitia/attendance";
import { pageNeedsModule } from "@/lib/server/main-wam/panitia/common";

export const dynamic = "force-dynamic";
export const metadata = { title: "Absen sesi · WAM", robots: { index: false } };

/** K05 Absen sesi. Panitia and Admin WAM, with module Absen QR on; anyone else: not found. */
export default async function AbsenSesiPage({ searchParams }: { searchParams: Promise<{ sesi?: string }> }) {
  const { sesi } = await searchParams;
  const context = await requireActionPage("kelola", mainWamPath.attendanceManual(sesi));
  pageNeedsModule(context, "absen");
  const data = await attendanceData(sesi, new Date(), context.viewer);
  return <AbsenManual key={data.session?.id ?? "none"} {...data} />;
}
