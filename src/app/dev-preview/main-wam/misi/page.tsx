import { notFound } from "next/navigation";
// The theme first (its reset), then the shell, as acara/layout.tsx and (app)/layout.tsx load them.
import { LangProvider } from "@/components/main-wam/i18n";
import { MainWamTheme } from "@/components/main-wam/theme";
import { MainWamShell } from "@/components/main-wam/shell";
import { previewLang } from "@/components/main-wam/dev/lang";
import { MisiCard } from "@/components/main-wam/misi/MisiCard";
import { MisiScreen } from "@/components/main-wam/misi/MisiScreen";
import { MissionCamera } from "@/components/main-wam/misi/MissionCamera";
import { MissionCheckIn } from "@/components/main-wam/misi/MissionCheckIn";
import { RankScreen } from "@/components/main-wam/misi/RankScreen";
import { homeGreeting } from "@/lib/main-wam/greeting";
import { missionItems, summarize, type MisiView } from "@/lib/main-wam/misi/missions";
import { rankPeople } from "@/lib/main-wam/misi/rank";
import { sampleBoard, sampleCompletions, sampleMissions } from "@/lib/main-wam/misi/sample";
import { samplePeople, sampleSessionIds, sampleSettings } from "@/lib/main-wam/sample";
import { mainWamScreen } from "@/lib/main-wam/screen";
import { mainWamPath } from "@/lib/routes";

export const dynamic = "force-dynamic";

/**
 * Misi with sample data, no sign-in, 404 in production:
 * ?layar=beranda|misi|peringkat|foto|checkin  (foto and checkin are the demo version: nothing is read or saved)
 * &lembar=<judul misi, bagian awal>  (the mission's sheet open on Misi)  &status=menunggu|ditolak|semua|kosong|tutup
 * &mode=dark  &lang=en
 */
export default async function PreviewMisi({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const params = await searchParams;
  const lang = previewLang(params);
  const me = samplePeople.rani.id;
  const now = new Date("2027-01-05T10:00:00+07:00");
  const completions = params.status === "semua" ? sampleMissions.map((mission, index) => ({ ...sampleCompletions(me)[0], id: `c${index}`, missionId: mission.id }))
    : params.status === "menunggu" ? [...sampleCompletions(me), { ...sampleCompletions(me)[0], id: "w", missionId: sampleMissions[2].id, status: "menunggu" as const }]
      : params.status === "ditolak" ? [...sampleCompletions(me), { ...sampleCompletions(me)[0], id: "r", missionId: sampleMissions[2].id, status: "ditolak" as const, reviewNote: "Bukan di depan tugu apel." }]
        : params.status === "kosong" ? [] : sampleCompletions(me);
  const sessions = [{ id: sampleSessionIds["team-building"], title: "Team building" }];
  const items = missionItems(params.status === "kosong" ? [] : sampleMissions, completions, { sessions, settings: { defaultRadiusM: 50 }, now });
  const view: MisiView = { migrated: true, sample: true, items, summary: summarize(items), points: 340, place: { rank: 7, of: 118 }, leaderboardOpen: true };
  const board = rankPeople(sampleBoard(me, "Rani"), me);
  const layar = params.layar ?? "misi";
  const path = layar === "beranda" ? mainWamPath.home : layar === "peringkat" ? mainWamPath.missionRank : layar === "foto" || layar === "checkin" ? mainWamPath.missionDo("x") : mainWamPath.missions;
  const open = params.lembar ? items.find(item => item.title.toLowerCase().startsWith(params.lembar!.toLowerCase()))?.id ?? null : null;
  const photo = items.find(item => item.kind === "foto" && item.hasPlace) ?? items[0];
  const checkin = items.find(item => item.kind === "checkin") ?? items[0];
  return <MainWamTheme mode={params.mode === "dark" ? "dark" : "light"}>
    <LangProvider lang={lang}>
      <MainWamShell screen={mainWamScreen(path, lang)} unread={0} greeting={homeGreeting(now, "Rani", sampleSettings().event, undefined, lang)}>
        {layar === "beranda" ? <div style={{ display: "grid", gap: 12, padding: 16 }}><MisiCard view={view} /></div>
          : layar === "peringkat" ? <RankScreen migrated open rows={board} />
            : layar === "foto" ? <MissionCamera item={photo} demo />
              : layar === "checkin" ? <MissionCheckIn item={checkin} demo />
                : <MisiScreen view={view} initialOpen={open} />}
      </MainWamShell>
    </LangProvider>
  </MainWamTheme>;
}
