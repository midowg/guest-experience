import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { DevFrame } from "@/components/main-wam/dev/DevFrame";
import { previewLang } from "@/components/main-wam/dev/lang";
import { t, type Lang } from "@/lib/main-wam/i18n";
import { MomenCard } from "@/components/main-wam/momen/BerandaMomen";
import { CameraScreen, type CameraDemo } from "@/components/main-wam/momen/CameraScreen";
import { Gallery, type GalleryProps } from "@/components/main-wam/momen/Gallery";
import { Mosaic } from "@/components/main-wam/momen/Mosaic";
import { MomenStack, type MomenStackProps, type StackDemo } from "@/components/main-wam/momen/MomenStack";
import { GallerySkeleton, MosaicSkeleton, StackSkeleton } from "@/components/main-wam/momen/Skeletons";
import { ScreenContent } from "@/components/main-wam/shell";
import { List, ListRow } from "@/components/main-wam/ui";
import { Images } from "lucide-react";
import { sessionChoice } from "@/lib/main-wam/momen/sessions";
import { flushedText, newPhotosText, sentText } from "@/lib/main-wam/momen/stack";
import { HEART, type ReactionCount } from "@/lib/main-wam/momen/reactions";
import { SAMPLE_TOTAL, sampleFeedSemua, sampleGalleryAll, sampleGalleryMine, sampleMosaic, sampleReactions, sampleSessionCounts } from "@/lib/main-wam/momen/sample";
import { sampleSessionIds, sampleSessions, sampleTime } from "@/lib/main-wam/sample";
import { mainWamPath } from "@/lib/routes";
import { DemoToast } from "./DemoToast";

export const dynamic = "force-dynamic";

/*
 * Area B's screens and states with sample data, in the real frame (DevFrame), no sign-in, 404 in
 * production: /dev-preview/main-wam/momen?layar=<id>. Ids follow the prototype (M01, M01-sesi, …).
 */

const LAYAR = [
  "M01", "M01-sesi", "M01-reaksi-saya", "M01-reaksi-banyak", "M01-sheet-reaksi", "M01-memuat", "M01-kosong", "M01-offline", "M01-aksi-orang", "M01-aksi-sendiri", "M01-hapus", "M01-disembunyikan", "M01-disembunyikan-panitia", "M01-fotomu", "M01-fotomu-kosong",
  "M02-dari-galeri", "M03", "M04",
  "M05", "M05-fotoku", "M05-sesi", "M05-kosong", "M05-memuat",
  "M06", "M06-tandai", "M06-tandai-kosong", "M06-memuat", "M06-lengkap",
  "U01", "U01-umum", "U01-pilih-sesi", "U02", "U02-dibatalkan", "U03", "U03-online", "U04", "U04-ditolak", "U05", "O04", "U-hp",
  "P01-kartu", "P04-baris", "M01-memuat-halaman",
] as const;

const pemaparanNow = sampleTime("pemaparan");
/** A photo's reactions swapped for a list (the prototype's busy photo: six emoji, one of them the viewer's). */
const withReactions = (items: typeof sampleFeedSemua, at: number, reactions: ReactionCount[]) => items.map((photo, index) => (index === at ? { ...photo, reactions } : photo));
const manyReactions: ReactionCount[] = [
  { emoji: HEART, count: 12, mine: true }, { emoji: "😂", count: 6, mine: false }, { emoji: "🎉", count: 4, mine: false }, { emoji: "🔥", count: 3, mine: false },
  { emoji: "👏", count: 3, mine: false }, { emoji: "😮", count: 2, mine: false }, { emoji: "🙏", count: 1, mine: false },
];
const sessions = sampleSessions.filter(session => session.status === "terbit");
const choices = (now: Date, lang: Lang = "id") => sessions.map(session => sessionChoice(session, now, lang));

function stack(over: Partial<MomenStackProps> & { demo?: StackDemo } = {}): MomenStackProps {
  return {
    mode: "baru", session: null, sessionTitle: null, items: sampleFeedSemua, next: null, total: 24, startIndex: 2, offset: 0,
    mozaik: true, migrated: true,
    anyPhotos: true, own: null, eventName: "WAM 2026", nowIso: pemaparanNow.toISOString(), ...over,
  };
}
function gallery(over: Partial<GalleryProps> = {}): GalleryProps {
  return {
    view: "semua", session: null, sessionTitle: null, items: [...sampleFeedSemua, ...sampleGalleryAll].map(photo => ({ ...photo, seen: true })), next: null, total: SAMPLE_TOTAL,
    counts: sampleSessionCounts, sessions: choices(pemaparanNow), mozaik: true, migrated: true, nowIso: pemaparanNow.toISOString(), ...over,
  };
}

export default async function DevMomen({ searchParams }: { searchParams: Promise<{ layar?: string; lang?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const params = await searchParams;
  const { layar: asked } = params;
  const lang = previewLang(params);
  const layar = (LAYAR as readonly string[]).includes(asked ?? "") ? asked! : "M01";
  const at = (path: string, children: ReactNode, waktu = "pemaparan") => <DevFrame path={path} waktu={waktu} lang={lang}>{children}</DevFrame>;

  /* M01–M04: the stack. */
  const momen = mainWamPath.moments();
  switch (layar) {
    case "M01": return at(momen, <MomenStack {...stack({ demo: { hint: true } })} />);
    case "M01-sesi": return at(momen, <MomenStack {...stack({ mode: "sesi", session: sampleSessionIds.pemaparan, sessionTitle: "Pemaparan departemen", items: sampleFeedSemua.slice(8), startIndex: 0, demo: {} })} />);
    case "M01-reaksi-saya": return at(momen, <MomenStack {...stack({ items: withReactions(sampleFeedSemua, 2, sampleReactions(24, HEART)), demo: {} })} />);
    case "M01-reaksi-banyak": return at(momen, <MomenStack {...stack({ items: withReactions(sampleFeedSemua, 2, manyReactions), demo: {} })} />);
    case "M01-sheet-reaksi": return at(momen, <MomenStack {...stack({ items: withReactions(sampleFeedSemua, 2, sampleReactions(24, HEART)), demo: { sheet: "reaksi" } })} />);
    case "M01-memuat": return at(momen, <MomenStack {...stack({ demo: { loading: true } })} />);
    case "M01-memuat-halaman": return at(momen, <StackSkeleton />);
    case "M01-kosong": return at(momen, <MomenStack {...stack({ items: [], total: 0, anyPhotos: false, demo: {} })} />);
    case "M01-offline": return at(momen, <MomenStack {...stack({ demo: { offline: true } })} />);
    case "M01-aksi-orang": return at(momen, <MomenStack {...stack({ demo: { sheet: "pilihan" } })} />);
    case "M01-aksi-sendiri": return at(momen, <MomenStack {...stack({ items: sampleFeedSemua.map((photo, index) => (index === 2 ? { ...photo, mine: true } : photo)), demo: { sheet: "pilihan" } })} />);
    case "M01-hapus": return at(momen, <MomenStack {...stack({ items: sampleFeedSemua.map((photo, index) => (index === 2 ? { ...photo, mine: true } : photo)), demo: { sheet: "hapus" } })} />);
    case "M01-disembunyikan": return at(momen, <><MomenStack {...stack({ demo: { hiddenForMe: true } })} /><DemoToast text="Laporan terkirim. Terima kasih." tone="success" /></>);
    case "M01-disembunyikan-panitia": return at(mainWamPath.moments({ foto: sampleFeedSemua[0].id }), <MomenStack {...stack({
      mode: "galeri", items: [{ ...sampleFeedSemua[0], mine: true, status: "disembunyikan" }], total: 1, startIndex: 0, own: { id: sampleFeedSemua[0].id, status: "disembunyikan", reason: "" }, demo: {},
    })} />);
    case "M01-fotomu": return at(momen, <MomenStack {...stack({ items: sampleFeedSemua.map((photo, index) => (index === 2 ? { ...photo, mine: true, seen: true, reactions: sampleReactions(12) } : photo)), total: 2, startIndex: 2, demo: {} })} />);
    case "M01-fotomu-kosong": return at(momen, <MomenStack {...stack({ items: sampleFeedSemua.map((photo, index) => (index === 2 ? { ...photo, mine: true, seen: true, reactions: [] } : photo)), total: 2, startIndex: 2, demo: {} })} />);
    case "M02-dari-galeri": return at(mainWamPath.moments({ foto: sampleGalleryAll[3].id }), <MomenStack {...stack({
      mode: "galeri", items: sampleGalleryAll, total: 21, startIndex: 3, demo: {},
    })} />, "pemaparan");
    case "M03": return at(momen, <MomenStack {...stack({ startIndex: 24, demo: {} })} />);
    case "M04": return at(momen, <MomenStack {...stack({ demo: { sheet: "lapor" } })} />);
  }

  /* M05: Galeri. */
  const galeri = mainWamPath.gallery();
  switch (layar) {
    case "M05": return at(galeri, <Gallery {...gallery()} />);
    case "M05-fotoku": return at(galeri, <Gallery {...gallery({ view: "saya", items: sampleGalleryMine, total: 6 })} />);
    case "M05-sesi": return at(galeri, <Gallery {...gallery({ session: sampleSessionIds["team-building"], sessionTitle: "Team building", items: sampleFeedSemua.slice(0, 6), total: 38 })} />);
    case "M05-kosong": return at(galeri, <Gallery {...gallery({ session: sampleSessionIds.bns, sessionTitle: "Batu Night Spectacular", items: [], total: 0 })} />);
    case "M05-memuat": return at(galeri, <GallerySkeleton />);
  }

  /* M06: Mozaik. */
  const mozaik = mainWamPath.mosaic();
  switch (layar) {
    case "M06": return at(mozaik, <Mosaic initial={sampleMosaic()} mark={false} title={t(lang, "momen.mos.title", { name: "WAM 2026" })} demo />);
    case "M06-tandai": return at(mozaik, <Mosaic initial={sampleMosaic()} mark title={t(lang, "momen.mos.title", { name: "WAM 2026" })} demo />);
    case "M06-tandai-kosong": return at(mozaik, <Mosaic initial={sampleMosaic(0.52, 0)} mark title={t(lang, "momen.mos.title", { name: "WAM 2026" })} demo />);
    case "M06-memuat": return at(mozaik, <MosaicSkeleton />);
    case "M06-lengkap": return at(mozaik, <Mosaic initial={sampleMosaic(1)} mark={false} title={t(lang, "momen.mos.title", { name: "WAM 2026" })} demo />);
  }

  /* U01–U05, O04: the camera at Team building (15.20). */
  const kamera = mainWamPath.camera();
  const teamNow = sampleTime("teamBuilding");
  const camera = (demo: CameraDemo, over: { initialSession?: string | null; now?: Date } = {}) => <CameraScreen
    sessions={sessions} nowIso={(over.now ?? teamNow).toISOString()} absen migrated initialSession={over.initialSession ?? null} demo={demo} />;
  switch (layar) {
    case "U01": return at(kamera, camera({ phase: "kamera", live: "contoh" }), "teamBuilding");
    case "U01-umum": return at(kamera, camera({ phase: "kamera", live: "contoh" }, { now: new Date("2027-01-05T14:45:00+07:00") }), "teamBuilding");
    case "U01-pilih-sesi": return at(kamera, camera({ phase: "kamera", live: "contoh", sheet: "sesi" }), "teamBuilding");
    case "U02": return at(kamera, <>{camera({ phase: "kamera", live: "contoh" })}<DemoToast text={sentText(1, lang)} sub={t(lang, "momen.cam.sentSession", { title: "Team building" })} action={t(lang, "momen.cam.undo")} secondary={t(lang, "ui.see")} timer thumb /></>, "teamBuilding");
    case "U02-dibatalkan": return at(kamera, <>{camera({ phase: "kamera", live: "contoh" })}<DemoToast text={t(lang, "momen.cam.cancelledOne")} tone="info" /></>, "teamBuilding");
    case "U03": return at(kamera, <>{camera({ phase: "kamera", live: "contoh", pill: 2, offline: true })}<DemoToast text={t(lang, "momen.cam.sendsOnline")} action="Batalkan" thumb /></>, "teamBuilding");
    case "U03-online": return at(momen, <><MomenStack {...stack({ demo: {} })} /><DemoToast text={flushedText(2, lang)} tone="success" /></>);
    case "U04": return at(kamera, <>{camera({ phase: "kamera", live: "contoh" })}<DemoToast text={sentText(3, lang)} action="Batalkan" timer thumb /></>, "teamBuilding");
    case "U04-ditolak": return at(kamera, camera({ phase: "kamera", live: "contoh", sheet: "galeri" }), "teamBuilding");
    case "U05": return at(kamera, camera({ phase: "kamera", live: "ditolak" }), "teamBuilding");
    case "U-hp": return at(kamera, camera({ phase: "kamera", live: "hp" }), "teamBuilding");
    case "O04": return at(kamera, camera({ phase: "izin" }), "pagi");
  }

  /* The slots on other areas' screens. */
  if (layar === "P01-kartu") return at(mainWamPath.home, <ScreenContent><MomenCard photos={[null, null, null]} sub={newPhotosText(12, 12, lang)} runner={false} /></ScreenContent>);
  return at(mainWamPath.session(sampleSessionIds.pemaparan), <ScreenContent><List>
    <ListRow icon={<Images />} title={t(lang, "momen.sessionPhotos")} value={24} href={mainWamPath.moments({ sesi: sampleSessionIds.pemaparan })} />
  </List></ScreenContent>);
}
