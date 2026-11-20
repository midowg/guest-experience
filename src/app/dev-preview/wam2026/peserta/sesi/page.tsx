import { notFound } from "next/navigation";
import { previewLang } from "@/components/main-wam/dev/lang";
// The frame (theme) first, so its reset comes before the screen's styles, as the app's layout does.
import { Frame } from "../Frame";
import { SessionScreen } from "@/components/main-wam/peserta/agenda/SessionScreen";
import { SessionSkeleton } from "@/components/main-wam/peserta/Skeletons";
import { contactLinks } from "@/lib/main-wam/peserta/contact";
import { sessionView } from "@/lib/main-wam/peserta/session";
import { samplePeople, sampleSessionIds } from "@/lib/main-wam/sample";
import { mainWamPath } from "@/lib/routes";
import { previewLog, previewSessions, previewTime } from "../sample";
import { AbsenStandIn, SessionPhotosStandIn } from "../standins";

export const dynamic = "force-dynamic";

/**
 * P04 Detail sesi with sample data (dev-preview, 404 in production): ?sesi=pemaparan|silent|
 * team-building|gala|… (keys of sampleSessionIds), ?waktu= or ?hari=&jam=, ?info=1 (Info lainnya
 * open), ?status=memuat|batal|absen (with agen D's Absen stand-in).
 */
export default async function PreviewSession({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const params = await searchParams;
  const lang = previewLang(params);
  const now = previewTime({ waktu: params.waktu ?? "pemaparan", hari: params.hari, jam: params.jam });
  const key = params.sesi && params.sesi in sampleSessionIds ? params.sesi : "pemaparan";
  const path = mainWamPath.session(sampleSessionIds[key]);
  if (params.status === "memuat") return <Frame path={path} now={now} lang={lang}><SessionSkeleton /></Frame>;
  const found = previewSessions(now).find(session => session.id === sampleSessionIds[key])!;
  const session = params.status === "batal" ? { ...found, status: "batal" as const } : found;
  const dimas = samplePeople.dimas;
  const contact = { id: dimas.id, name: dimas.name, role: "Panitia", photo: null, ...contactLinks("0800-0000-0001") };
  const view = sessionView(session, now, previewLog(now), true, lang);
  const photos = { pemaparan: 24, "team-building": 38 }[key] ?? 0;
  const started = Date.parse(session.startsAt) <= now.getTime();
  return <Frame path={path} now={now} lang={lang}>
    <SessionScreen view={view} contact={contact} denahHref={mainWamPath.guide("denah-venue")} openInfo={params.info === "1"}
      slots={{ absen: params.status === "absen" || (key === "pemaparan" && params.status !== "tanpa-absen") ? <AbsenStandIn /> : null, photos: photos && started ? <SessionPhotosStandIn sessionId={session.id} count={photos} /> : null }} />
  </Frame>;
}
