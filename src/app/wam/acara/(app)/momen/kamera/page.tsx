import { CameraScreen } from "@/components/main-wam/momen/CameraScreen";
import { mainWamPath } from "@/lib/routes";
import { requireActionPage } from "@/lib/server/main-wam/gate";
import { cameraScreen } from "@/lib/server/main-wam/momen/screens";

export const dynamic = "force-dynamic";
export const metadata = { title: "Kamera · WAM", robots: { index: false } };

type Search = Record<string, string | string[] | undefined>;
const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** U01–U05 and O04: the camera (photo sent when taken, Batalkan 5 s, queue offline, gallery). Area B. */
export default async function KameraPage({ searchParams }: { searchParams: Promise<Search> }) {
  const search = await searchParams;
  const untuk = one(search.untuk);
  const context = await requireActionPage("foto", mainWamPath.camera({ sesi: one(search.sesi), untuk: untuk === "kelompok" || untuk === "semua" ? untuk : undefined }));
  return <CameraScreen {...await cameraScreen(context, search)} />;
}
