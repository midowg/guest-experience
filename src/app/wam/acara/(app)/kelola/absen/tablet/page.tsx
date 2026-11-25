import { FaceTablet } from "@/components/main-wam/panitia/FaceTablet";
import { mainWamPath } from "@/lib/routes";
import { requireActionPage } from "@/lib/server/main-wam/gate";
import { pageNeedsModule } from "@/lib/server/main-wam/panitia/common";
import { tabletData } from "@/lib/server/main-wam/panitia/face-tablet";

export const dynamic = "force-dynamic";
export const metadata = { title: "Absen mode tablet · WAM", robots: { index: false } };

/** K05b Absen mode tablet: face check-in on panitia's tablet. Panitia, with module Absen QR on; anyone else: not found. */
export default async function AbsenTabletPage({ searchParams }: { searchParams: Promise<{ sesi?: string }> }) {
  const { sesi } = await searchParams;
  const context = await requireActionPage("kelola", mainWamPath.attendanceTablet(sesi));
  pageNeedsModule(context, "absen");
  const data = await tabletData(sesi, new Date(), context.viewer);
  return <FaceTablet data={data} backHref={mainWamPath.attendanceManual(data.sessionId ?? undefined)} />;
}
