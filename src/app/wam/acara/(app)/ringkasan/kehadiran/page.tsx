import { Kehadiran } from "@/components/main-wam/panitia/Kehadiran";
import { mainWamPath } from "@/lib/routes";
import { requireActionPage } from "@/lib/server/main-wam/gate";
import { pageNeedsModule } from "@/lib/server/main-wam/panitia/common";
import { attendanceDay } from "@/lib/server/main-wam/panitia/summary";

export const dynamic = "force-dynamic";
export const metadata = { title: "Kehadiran · WAM", robots: { index: false } };

/** B02 Kehadiran: aggregates only. BOD only, with module Absen QR on; anyone else: not found. */
export default async function KehadiranPage({ searchParams }: { searchParams: Promise<{ hari?: string }> }) {
  const { hari } = await searchParams;
  const context = await requireActionPage("ringkasan", mainWamPath.attendanceSummary(Number(hari) || undefined));
  pageNeedsModule(context, "absen");
  return <Kehadiran data={await attendanceDay(context, hari)} />;
}
