import { notFound } from "next/navigation";
// The frame (theme) first, so its reset comes before the screen's styles, as the app's layout does.
import { Frame } from "../Frame";
import { SayaScreen } from "@/components/main-wam/peserta/saya/SayaScreen";
import { ListSkeleton } from "@/components/main-wam/peserta/Skeletons";
import { contactLinks } from "@/lib/main-wam/peserta/contact";
import { profileLine, roomRow } from "@/lib/main-wam/peserta/saya";
import { samplePeople } from "@/lib/main-wam/sample";
import { mainWamPath } from "@/lib/routes";
import { previewTime, previewViewer } from "../sample";

export const dynamic = "force-dynamic";

/** P05 / P05B Saya with sample data (dev-preview): ?peran=peserta|panitia|bod, ?buka=foto|bantuan|keluar, ?status=memuat|tanpa-kamar. */
export default async function PreviewSaya({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const params = await searchParams;
  const now = previewTime({ waktu: params.waktu ?? "pemaparan" });
  const viewer = previewViewer(params.peran);
  if (params.status === "memuat") return <Frame path={mainWamPath.me} peran={params.peran} now={now}><ListSkeleton label="Memuat saya" /></Frame>;
  const help = { id: samplePeople.dimas.id, name: "Dimas", role: "Panitia", photo: null, ...contactLinks("0800-0000-0001") };
  const room = params.status === "tanpa-kamar" || !viewer.room ? null : roomRow(viewer.room);
  const open = params.buka === "foto" || params.buka === "bantuan" || params.buka === "keluar" ? params.buka : null;
  return <Frame path={mainWamPath.me} peran={params.peran} now={now}>
    <SayaScreen name={viewer.name} fullName={viewer.fullName} line={profileLine(viewer)} photo={null} room={room} mcp={params.peran === "bod"} help={help} open={open} />
  </Frame>;
}
