import { notFound } from "next/navigation";
import { previewLang } from "@/components/main-wam/dev/lang";
// The frame (theme) first, so its reset comes before the screen's styles, as the app's layout does.
import { Frame } from "../Frame";
import { SayaScreen } from "@/components/main-wam/peserta/saya/SayaScreen";
import { ListSkeleton } from "@/components/main-wam/peserta/Skeletons";
import { profileLine, roomRow } from "@/lib/main-wam/peserta/saya";
import { mainWamPath } from "@/lib/routes";
import { previewTime, previewViewer } from "../sample";

export const dynamic = "force-dynamic";

/** P05 / P05B Saya with sample data (dev-preview): ?peran=peserta|panitia|bod, ?buka=foto|keluar, ?status=memuat|tanpa-kamar, ?karbon=mati (module off). */
export default async function PreviewSaya({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const params = await searchParams;
  const now = previewTime({ waktu: params.waktu ?? "pemaparan" });
  const viewer = previewViewer(params.peran);
  const lang = previewLang(params);
  if (params.status === "memuat") return <Frame path={mainWamPath.me} peran={params.peran} now={now} lang={lang}><ListSkeleton label="Memuat saya" /></Frame>;
  const room = params.status === "tanpa-kamar" || !viewer.room ? null : roomRow(viewer.room, lang);
  const open = params.buka === "foto" || params.buka === "keluar" ? params.buka : null;
  return <Frame path={mainWamPath.me} peran={params.peran} now={now} lang={lang}>
    <SayaScreen name={viewer.name} fullName={viewer.fullName} line={profileLine(viewer)} photo={null} room={room} carbon={params.karbon !== "mati"} mosaic={params.mozaik !== "mati"} open={open} />
  </Frame>;
}
