import { SilentRecapView } from "@/components/main-wam/modul/bod/SilentRecapView";
import { Waiting } from "@/components/main-wam/modul/Waiting";
import { mainWamPath } from "@/lib/routes";
import { requireActionPage } from "@/lib/server/main-wam/gate";
import { silentRecap } from "@/lib/server/main-wam/modul/silent";

export const dynamic = "force-dynamic";
export const metadata = { title: "Rekap Silent Meeting · WAM", robots: { index: false } };

/** B05 Rekap Silent Meeting: BOD only, module Silent Meeting. Shuffled on every visit, never with a time. */
export default async function SilentRecapPage() {
  await requireActionPage("silent-rekap", mainWamPath.silentRecap);
  const { recap, migrated } = await silentRecap(new Date());
  if (!migrated) return <Waiting />;
  return <SilentRecapView recap={recap} />;
}
