import { notFound } from "next/navigation";
// The frame (theme) first, so its reset comes before the screen's styles, as the app's layout does.
import { Frame } from "../Frame";
import { BerandaScreen } from "@/components/main-wam/peserta/beranda/BerandaScreen";
import { hhmm } from "@/lib/main-wam/peserta/format";
import { mainWamPath } from "@/lib/routes";
import { BerandaSkeleton } from "@/components/main-wam/peserta/Skeletons";
import { previewHome, previewTime, previewViewer, type PreviewCard } from "../sample";
import { AbsenStandIn, MomenStandIn } from "../standins";

export const dynamic = "force-dynamic";

/**
 * P01/P02 Beranda with sample data, no sign-in, 404 in production:
 * ?waktu=berangkat|pagi|pemaparan|silent|teamBuilding|bod (or ?hari=2&jam=07:10), ?peran=peserta|panitia|bod,
 * ?kartu=pengumuman|silent|voting|berangkat|survei|tanpa (force the contextual card),
 * ?status=memuat|offline|kosong|migrasi|gagal.
 */
export default async function PreviewBeranda({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const params = await searchParams;
  const now = previewTime(params);
  const viewer = previewViewer(params.peran);
  if (params.status === "memuat") return <Frame path={mainWamPath.home} peran={params.peran} now={now}><BerandaSkeleton /></Frame>;
  const base = previewHome(now, viewer, undefined, (params.kartu as PreviewCard | undefined) ?? null);
  const data = params.status === "kosong" ? { ...base, now: { kind: "kosong" as const }, card: null }
    : params.status === "migrasi" ? { ...base, migrated: false, card: null }
      : params.status === "gagal" ? { ...base, failed: true }
        : base;
  return <Frame path={mainWamPath.home} peran={params.peran} now={now} unread={params.waktu === "berangkat" ? 0 : 3}>
    <BerandaScreen data={data} serverNow={now.toISOString()} since={hhmm(new Date(now.getTime() - 2 * 60_000).toISOString())} live={false} forceOffline={params.status === "offline"}
      slots={{ absen: <AbsenStandIn />, momen: <MomenStandIn count={params.waktu === "berangkat" ? 3 : 12} /> }} />
  </Frame>;
}
