import { notFound } from "next/navigation";
import { previewLang } from "@/components/main-wam/dev/lang";
// The frame (theme) first, so its reset comes before the screen's styles, as the app's layout does.
import { Frame } from "../Frame";
import { AbsenView, ModuleActionView } from "@/components/main-wam/modul/SessionViews";
import { SessionScreen } from "@/components/main-wam/peserta/agenda/SessionScreen";
import { SessionSheet, SessionSheetLoading } from "@/components/main-wam/peserta/agenda/SessionSheet";
import { ceklisBlock } from "@/lib/main-wam/ceklis/ceklis";
import { sampleChecklistItems, sampleChecklists, samplePrepSession } from "@/lib/main-wam/ceklis/sample";
import { AgendaScreen } from "@/components/main-wam/peserta/agenda/AgendaScreen";
import { agendaDays, agendaRowsOfTab, shownTab } from "@/lib/main-wam/peserta/agenda";
import { hhmm } from "@/lib/main-wam/peserta/format";
import { sampleSettings } from "@/lib/main-wam/sample";
import { todayOf } from "../sample";
import { contactLinks } from "@/lib/main-wam/peserta/contact";
import { sessionView } from "@/lib/main-wam/peserta/session";
import { sampleAttendance, samplePeople, sampleSessionIds } from "@/lib/main-wam/sample";
import { mainWamPath } from "@/lib/routes";
import { previewLog, previewSessions, previewTime } from "../sample";
import { AbsenStandIn, SessionPhotosStandIn } from "../standins";

export const dynamic = "force-dynamic";

/**
 * P04 Detail sesi with sample data (dev-preview, 404 in production): ?sesi=pemaparan|silent|
 * team-building|gala|… (keys of sampleSessionIds), ?waktu= or ?hari=&jam=, ?info=1 (Info lainnya
 * open), ?status=memuat|batal|absen (with agen D's Absen stand-in)|hadir (recorded, "Hadir 07.52"),
 * ?qr=1 (the QR check-in shown: the Absen button; the default follows QR_ABSEN_VISIBLE, KONTRAK 41, hidden: one line about the tablet).
 */
export default async function PreviewSession({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const params = await searchParams;
  const lang = previewLang(params);
  const now = previewTime({ waktu: params.waktu ?? "pemaparan", hari: params.hari, jam: params.jam });
  const prep = params.sesi === "persiapan";
  const key = params.sesi && params.sesi in sampleSessionIds ? params.sesi : prep ? "persiapan" : "pemaparan";
  const path = mainWamPath.session(prep ? samplePrepSession.id : sampleSessionIds[key]);
  // Loading: the screen behind stays as it is (Agenda here; from Beranda it is Beranda), only the sheet is a skeleton.
  if (params.status === "memuat") {
    const event = sampleSettings().event;
    const tab = shownTab(undefined, now, event, []);
    return <Frame path={mainWamPath.agenda()} now={now} lang={lang}>
      <AgendaScreen migrated days={agendaDays(event, todayOf(now), lang, [])} day={/^\d+$/.test(tab) ? Number(tab) : 0} tab={tab}
        rows={agendaRowsOfTab(previewSessions(now), tab, event, now, previewLog(now), lang)} anyPublished since={hhmm(new Date(now.getTime() - 120_000).toISOString(), lang)} />
      <SessionSheetLoading />
    </Frame>;
  }
  const found = prep ? samplePrepSession : previewSessions(now).find(session => session.id === sampleSessionIds[key])!;
  const session = params.status === "batal" ? { ...found, status: "batal" as const } : found;
  const dimas = samplePeople.dimas;
  const contact = { id: dimas.id, name: dimas.name, role: "Panitia", photo: null, ...contactLinks("0800-0000-0001") };
  const view = sessionView(session, now, previewLog(now), true, lang);
  const photos = { pemaparan: 24, "team-building": 38 }[key] ?? 0;
  const started = Date.parse(session.startsAt) <= now.getTime();
  // ?ceklis=0–5: the agenda's checklist with this many items ticked (Persiapan berangkat); on another agenda with absen, the lock until all five are.
  const ticked = params.ceklis !== undefined && /^[0-5]$/.test(params.ceklis) ? Number(params.ceklis) : null;
  const checked = new Set(sampleChecklistItems.slice(0, ticked ?? 0).map(item => item.id));
  const checklist = prep && ticked !== null ? { sessionId: session.id, required: true, items: sampleChecklistItems.map(item => ({ id: item.id, text: item.text, note: item.note, photoVersion: null, checked: checked.has(item.id) })) } : null;
  const block = !prep && ticked !== null ? ceklisBlock(session, [samplePrepSession, session], sampleChecklists(), checked) : null;
  const slots = {
    absen: block ? <AbsenView slot={{ kind: "ceklis", block }} /> : params.status === "hadir" ? <AbsenView slot={{ kind: "hadir", at: sampleAttendance.find(row => row.sessionId === sampleSessionIds.pemaparan)?.checkedInAt ?? now.toISOString() }} /> : params.status === "absen" || (key === "pemaparan" && params.status !== "tanpa-absen") ? <AbsenStandIn qr={params.qr === "1" ? true : undefined} /> : null,
    action: params.kuis === "1" ? <ModuleActionView slot={{ action: { kind: "link", label: "Ikut kuis", href: mainWamPath.quiz("demo"), icon: "kuis", primary: true }, qr: null }} /> : null,
    photos: photos && started ? <SessionPhotosStandIn sessionId={session.id} count={photos} /> : null,
  };
  if (params.tampil === "sheet") {
    return <Frame path={path} now={now} lang={lang}><SessionSheet view={view} contact={contact} denahHref={mainWamPath.guide("denah-venue")} closeHref={mainWamPath.agenda()} checklist={checklist} slots={slots} /></Frame>;
  }
  return <Frame path={path} now={now} lang={lang}>
    <SessionScreen view={view} contact={contact} denahHref={mainWamPath.guide("denah-venue")} openInfo={params.info === "1"} checklist={checklist} slots={slots} />
  </Frame>;
}
