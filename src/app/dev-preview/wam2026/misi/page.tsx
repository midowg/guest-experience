import { notFound } from "next/navigation";
// The theme first (its reset), then the shell, as acara/layout.tsx and (app)/layout.tsx load them.
import { LangProvider } from "@/components/main-wam/i18n";
import { MainWamTheme } from "@/components/main-wam/theme";
import { MainWamShell } from "@/components/main-wam/shell";
import { previewLang } from "@/components/main-wam/dev/lang";
import { MisiCard } from "@/components/main-wam/misi/MisiCard";
import { MisiScreen } from "@/components/main-wam/misi/MisiScreen";
import { MissionCamera } from "@/components/main-wam/misi/MissionCamera";
import { CameraScreen } from "@/components/main-wam/momen/CameraScreen";
import { DemoToast } from "../momen/DemoToast";
import { RankScreen } from "@/components/main-wam/misi/RankScreen";
import { homeGreeting } from "@/lib/main-wam/greeting";
import { missionItems, summarize, type MisiView } from "@/lib/main-wam/misi/missions";
import { rankPeople } from "@/lib/main-wam/misi/rank";
import { sampleBoard, sampleCompletions, sampleFromPhotos, sampleMissionOf, sampleMissions, sampleTaggedIn } from "@/lib/main-wam/misi/sample";
import { samplePeople, sampleSessions, sampleSettings } from "@/lib/main-wam/sample";
import { t } from "@/lib/main-wam/i18n";
import { mainWamScreen } from "@/lib/main-wam/screen";
import { sampleTagCandidates } from "@/lib/main-wam/misi/tag-sample";
import { mainWamPath } from "@/lib/routes";

export const dynamic = "force-dynamic";

/**
 * Misi with sample data, no sign-in, 404 in production:
 * ?layar=beranda|misi|peringkat|foto|checkin  (foto is the demo version: nothing is read or saved)
 * &langkah=tag|ringkas  (foto: start at the Tag or the Ringkasan step with the stand-in photo)
 * &misi=<judul, bagian awal>  (foto: which mission; default the BOD one)  &tag=wulan,arman  (people already tagged)
 * &lembar=<judul misi, bagian awal>  (the mission's sheet open on Misi)  &status=semua|kosong|batas
 * &mode=dark  &lang=en
 * Detection from Momen photos (KONTRAK §13): ?layar=kamera (the Momen camera with Tag teman and Tandai lokasi; &langkah=tag opens
 * "Ada siapa di foto ini?", &lokasi=aktif|mati|ditolak), ?layar=toast (the toast "otomatis diajukan" with Tarik; &jenis=saran for a
 * suggestion with Ajukan), ?layar=misi shows "Dari fotomu" (&status=kosong: nothing yet; &otomatis=mati: the switch off).
 */
export default async function PreviewMisi({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const params = await searchParams;
  const lang = previewLang(params);
  const me = samplePeople.rani.id;
  const now = new Date("2027-01-05T10:00:00+07:00");
  const base = sampleCompletions(me);
  const completions = params.status === "semua" ? sampleMissions.map((mission, index) => ({ ...base[0], id: `c${index}`, missionId: mission.id }))
    : params.status === "batas" ? [...base.filter(item => item.status !== "ditolak"), { ...base[4], id: "r2", missionId: sampleMissionOf("plank-jatim-park").id, attempts: 2, reviewNote: "Pose bukan plank." }]
      : params.status === "kosong" ? [] : base;
  const items = missionItems(params.status === "kosong" ? [] : sampleMissions, completions, { sessions: [], settings: { defaultRadiusM: 50 }, now });
  const view: MisiView = {
    migrated: true, sample: true, items, summary: summarize(items), points: params.status === "kosong" ? 0 : 3400, place: params.status === "kosong" ? null : { rank: 7, of: 118 }, leaderboardOpen: true, taggedIn: params.status === "kosong" ? [] : sampleTaggedIn,
    fromPhotos: params.status === "kosong" ? [] : sampleFromPhotos(items), autoDetect: params.otomatis !== "mati", autoDetectSaved: true,
  };
  const board = rankPeople(sampleBoard(me, "Rani"), me);
  const layar = params.layar ?? "misi";
  const camera = layar === "kamera" || layar === "toast";
  const path = camera ? mainWamPath.camera() : layar === "beranda" ? mainWamPath.home : layar === "peringkat" ? mainWamPath.missionRank : layar === "foto" || layar === "checkin" ? mainWamPath.missionDo("x") : mainWamPath.missions;
  const open = params.lembar ? items.find(item => item.title.toLowerCase().startsWith(params.lembar!.toLowerCase()))?.id ?? null : null;
  const photo = items.find(item => item.title.toLowerCase().startsWith((params.misi ?? "Foto bareng").toLowerCase())) ?? items[0];
  const candidates = sampleTagCandidates(me);
  const tagged = (params.tag ?? "").split(",").flatMap(name => candidates.find(candidate => candidate.name.toLowerCase() === name.trim().toLowerCase())?.id ?? []);
  const start = params.langkah === "tag" || params.langkah === "ringkas" ? params.langkah : null;
  const geo = params.lokasi === "aktif" || params.lokasi === "ditolak" ? params.lokasi : "mati";
  const found = params.jenis === "saran"
    ? { text: t(lang, "misi.auto.suggest", { title: "Selfie dengan teman sekamar" }), sub: t(lang, "misi.auto.suggestSub", { points: "400" }), action: t(lang, "misi.auto.submit") }
    : { text: t(lang, "misi.auto.sent", { title: "Selfie dengan teman sekamar" }), sub: t(lang, "misi.auto.sentSub", { points: "400" }), action: t(lang, "misi.auto.takeBack") };
  const cameraScreen = <CameraScreen sessions={sampleSessions} nowIso="2027-01-05T10:00:00+07:00" absen migrated initialSession={null} candidates={candidates} detect
    demo={{ phase: "kamera", live: "contoh", geo, ...(params.langkah === "tag" && layar === "kamera" ? { sheet: "tag" as const } : {}) }} />;
  return <MainWamTheme mode={params.mode === "dark" ? "dark" : "light"}>
    <LangProvider lang={lang}>
      <MainWamShell screen={mainWamScreen(path, lang)} unread={0} greeting={homeGreeting(now, "Rani", sampleSettings().event, undefined, lang)}>
        {camera ? <>{cameraScreen}{layar === "toast" && <DemoToast text={found.text} sub={found.sub} tone="info" action={found.action} secondary={t(lang, "misi.auto.open")} thumb />}</>
          : layar === "beranda" ? <div style={{ display: "grid", gap: 12, padding: 16 }}><MisiCard view={view} /></div>
          : layar === "peringkat" ? <RankScreen migrated open rows={board} />
            : layar === "foto" ? <MissionCamera item={photo} demo candidates={candidates} viewer={{ id: me, department: "CoE" }} demoStart={start} demoTagged={tagged} />
              : <MisiScreen view={view} initialOpen={open} />}
      </MainWamShell>
    </LangProvider>
  </MainWamTheme>;
}
