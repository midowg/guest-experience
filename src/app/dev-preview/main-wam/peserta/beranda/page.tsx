import { notFound } from "next/navigation";
import { previewLang } from "@/components/main-wam/dev/lang";
// The frame (theme) first, so its reset comes before the screen's styles, as the app's layout does.
import { Frame } from "../Frame";
import { BerandaScreen } from "@/components/main-wam/peserta/beranda/BerandaScreen";
import { hhmm } from "@/lib/main-wam/peserta/format";
import type { Lang } from "@/lib/main-wam/i18n";
import { mainWamPath } from "@/lib/routes";
import { BerandaSkeleton } from "@/components/main-wam/peserta/Skeletons";
import { announcementCandidates, homeCardView } from "@/lib/main-wam/peserta/home";
import { previewHome, previewTime, previewViewer, type PreviewCard } from "../sample";
import { AbsenStandIn, MomenStandIn } from "../standins";

export const dynamic = "force-dynamic";

/**
 * P01/P02 Beranda with sample data, no sign-in, 404 in production:
 * ?waktu=berangkat|pagi|pemaparan|silent|teamBuilding|bod (or ?hari=2&jam=07:10), ?peran=peserta|panitia|bod,
 * ?kartu=pengumuman|silent|voting|berangkat|survei|tanpa (force the contextual card),
 * ?status=memuat|offline|kosong|migrasi|gagal|kumpul (P02__status: a pinned "Kumpul jadi 05.30", a warning),
 * ?survei=terisi (the survey already sent: no card).
 */
export default async function PreviewBeranda({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const params = await searchParams;
  const now = previewTime(params);
  const lang = previewLang(params);
  const viewer = previewViewer(params.peran);
  if (params.status === "memuat") return <Frame path={mainWamPath.home} peran={params.peran} now={now} lang={lang}><BerandaSkeleton /></Frame>;
  const base = previewHome(now, viewer, undefined, (params.kartu as PreviewCard | undefined) ?? null, params.survei === "terisi", lang);
  const data = params.status === "kosong" ? { ...base, now: { kind: "kosong" as const }, card: null }
    : params.status === "migrasi" ? { ...base, migrated: false, card: null }
      : params.status === "gagal" ? { ...base, failed: true }
        : params.status === "kumpul" ? { ...base, card: gatheringMoved(now, lang) }
          : base;
  return <Frame path={mainWamPath.home} peran={params.peran} now={now} lang={lang} unread={params.waktu === "berangkat" ? 0 : 3}>
    <BerandaScreen data={data} serverNow={now.toISOString()} since={hhmm(new Date(now.getTime() - 2 * 60_000).toISOString(), lang)} live={false} forceOffline={params.status === "offline"}
      slots={{ absen: <AbsenStandIn />, momen: <MomenStandIn count={params.waktu === "berangkat" ? 3 : 12} /> }} />
  </Frame>;
}

/** P02__status: panitia moved the gathering (a warning, with the schedule icon). */
function gatheringMoved(now: Date, lang: Lang) {
  const until = new Date(now.getTime() + 2 * 3_600_000).toISOString();
  const [card] = announcementCandidates([{
    id: "00000000-0000-4000-8009-000000000010", kind: "pengumuman", title: "Kumpul jadi 05.30", body: "Tadinya 05.45.", createdAt: now.toISOString(),
    readAt: null, link: null, pinnedUntil: until, fromPraWam: false, tone: "warning",
  }], now);
  return card ? homeCardView(card, now, lang) : null;
}
