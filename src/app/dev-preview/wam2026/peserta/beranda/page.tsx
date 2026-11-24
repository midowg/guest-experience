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
import { AbsenStandIn } from "../standins";
import { uploadedByText } from "@/lib/main-wam/momen/stack";
import { MomenCard } from "@/components/main-wam/momen/BerandaMomen";
import { CarbonCard } from "@/components/main-wam/peserta/karbon/CarbonCard";
import { carbonView } from "@/lib/main-wam/peserta/carbon";
import { sampleCarbon } from "@/lib/main-wam/peserta/sample";
import { MozaikCard } from "@/components/main-wam/momen/BerandaMozaik";
import { letterCells } from "@/lib/main-wam/momen/mosaic";
import { number } from "@/lib/main-wam/i18n";
import { MisiCard } from "@/components/main-wam/misi/MisiCard";
import { KuisLiveCard } from "@/components/main-wam/kuis/BerandaKuis";
import { missionItems, summarize, type MisiView } from "@/lib/main-wam/misi/missions";
import { sampleCompletions, sampleMissions } from "@/lib/main-wam/misi/sample";
import { samplePeople, sampleSessionIds } from "@/lib/main-wam/sample";

export const dynamic = "force-dynamic";

/**
 * P01/P02 Beranda with sample data, no sign-in, 404 in production:
 * ?waktu=berangkat|pagi|pemaparan|silent|teamBuilding|bod (or ?hari=2&jam=07:10), ?peran=peserta|panitia|bod,
 * ?kartu=pengumuman|silent|voting|berangkat|survei|tanpa (force the contextual card),
 * ?status=memuat|offline|kosong|migrasi|gagal|kumpul (P02__status: a pinned "Kumpul jadi 05.30", a warning),
 * ?survei=terisi (the survey already sent: no card), ?karbon=mati|belum (Jejak karbon's card: module off, nothing counted yet),
 * ?mozaik=mati (the Mozaik card: module off), ?misi=mati (the Misi card: module off), ?kuis=buka (the live-quiz card).
 */
/** The Mozaik card with a sample: "WAM 2026" on 50 × 36, most letter cells already holding a photo. */
function MozaikStandIn({ lang }: { lang: Lang }) {
  const cells = letterCells(50, 36, "WAM 2026");
  const letters = [...cells].map((cell, index) => (cell === "." ? -1 : index)).filter(index => index >= 0);
  const filledCells = letters.filter((_, position) => position % 10 < 7);
  const summary = { columns: 50, rows: 36, cells, filledCells, filled: filledCells.length, total: letters.length, mine: 8, migrated: true };
  return <MozaikCard summary={summary} title={lang === "en" ? "Mosaic WAM 2026" : "Mozaik WAM 2026"} filled={number(lang, summary.filled)}
    rest={`${lang === "en" ? "of" : "dari"} ${number(lang, summary.total)} ${lang === "en" ? "photos" : "foto"} · 8 ${lang === "en" ? "yours" : "fotomu"}`} />;
}

/** The Misi card with sample missions (340 points, the next one open). */
function misiStandIn(now: Date, mode?: string): React.ReactNode {
  if (mode === "mati") return null;
  const me = samplePeople.rani.id;
  const items = missionItems(sampleMissions, sampleCompletions(me), { sessions: [{ id: sampleSessionIds["team-building"], title: "Team building" }], settings: { defaultRadiusM: 50 }, now });
  const view: MisiView = { migrated: true, sample: true, items, summary: summarize(items), points: 340, place: { rank: 7, of: 118 }, leaderboardOpen: true };
  return <MisiCard view={view} />;
}

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
      slots={{ absen: <AbsenStandIn home />, misi: misiStandIn(now, params.misi),
        kuis: params.kuis === "buka" ? <KuisLiveCard lang={lang} title={lang === "en" ? "WAM live quiz" : "Kuis live WAM"} joined={false} href={mainWamPath.quiz("contoh")} /> : null, momen: <MomenCard photos={[null, null, null]} unseen={params.waktu === "berangkat" ? 3 : 12} by={uploadedByText("Sari", "Aula Utama", new Date(now.getTime() - 2 * 60_000).toISOString(), now, lang)} sub={`${params.waktu === "berangkat" ? 3 : 12} foto baru`} runner={false} />,
        mozaik: params.mozaik === "mati" ? null : <MozaikStandIn lang={lang} />,
        carbon: params.karbon === "mati" ? null : <CarbonCard view={carbonView(params.karbon === "belum" ? null : sampleCarbon(), now, lang)} /> }} />
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
