import { notFound } from "next/navigation";
import { previewLang } from "@/components/main-wam/dev/lang";
// The frame (theme) first, so its reset comes before the screen's styles, as the app's layout does.
import { Frame } from "../Frame";
import { AgendaScreen } from "@/components/main-wam/peserta/agenda/AgendaScreen";
import { AgendaSkeleton } from "@/components/main-wam/peserta/Skeletons";
import { agendaDays, agendaRows, shownDay } from "@/lib/main-wam/peserta/agenda";
import { hhmm } from "@/lib/main-wam/peserta/format";
import { sampleSessionIds, sampleSettings } from "@/lib/main-wam/sample";
import { mainWamPath } from "@/lib/routes";
import { previewLog, previewSessions, previewTime, todayOf } from "../sample";

export const dynamic = "force-dynamic";

/**
 * P03 Agenda with sample data (dev-preview, 404 in production): ?waktu= or ?hari=&jam= for the
 * moment, ?tab=1–4 for the day shown, ?status=memuat|offline|kosong|migrasi|batal.
 */
export default async function PreviewAgenda({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const params = await searchParams;
  const now = previewTime(params);
  const lang = previewLang(params);
  const event = sampleSettings().event;
  if (params.status === "memuat") return <Frame path={mainWamPath.agenda()} now={now} lang={lang}><AgendaSkeleton /></Frame>;
  const sessions = previewSessions(now).map(session => params.status === "batal" && session.id === sampleSessionIds.bns ? { ...session, status: "batal" as const } : session);
  const day = shownDay(params.tab, now, event);
  const empty = params.status === "kosong" || params.status === "migrasi";
  return <Frame path={mainWamPath.agenda()} now={now} lang={lang}>
    <AgendaScreen migrated={params.status !== "migrasi"} days={agendaDays(event, todayOf(now), lang)} day={day}
      rows={empty ? [] : agendaRows(sessions, day, event, now, previewLog(now), lang)} anyPublished={!empty} since={hhmm(new Date(now.getTime() - 120_000).toISOString(), lang)} forceOffline={params.status === "offline"} />
  </Frame>;
}
