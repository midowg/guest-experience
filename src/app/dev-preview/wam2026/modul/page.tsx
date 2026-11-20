import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { DevFrame } from "@/components/main-wam/dev/DevFrame";
import { previewLang } from "@/components/main-wam/dev/lang";
import { ScreenContent, ScreenSection } from "@/components/main-wam/shell";
import { SectionHeader } from "@/components/main-wam/ui";
import { CheckInResultView, OfflineSaved } from "@/components/main-wam/modul/absen/CheckIn";
import { Scanner } from "@/components/main-wam/modul/absen/Scanner";
import { AwardList } from "@/components/main-wam/modul/awards/AwardList";
import { NomineePicker } from "@/components/main-wam/modul/awards/NomineePicker";
import { AwardApproval } from "@/components/main-wam/modul/bod/AwardApproval";
import { SilentRecapView } from "@/components/main-wam/modul/bod/SilentRecapView";
import { AbsenView, ModuleActionView } from "@/components/main-wam/modul/SessionViews";
import { SilentForm } from "@/components/main-wam/modul/silent/SilentForm";
import { SilentClosed, SilentForBod, SilentNotYet } from "@/components/main-wam/modul/silent/SilentStates";
import { Waiting } from "@/components/main-wam/modul/Waiting";
import type { CheckInOutcome } from "@/lib/main-wam/modul/absen";
import { closedCounts, voteCard } from "@/lib/main-wam/modul/awards";
import { at, sampleApprovals, sampleContact, sampleCounts, sampleNominees, sampleRecap, sampleSilentView } from "@/lib/main-wam/modul/sample";
import { sampleAwards, samplePeople, sampleSession } from "@/lib/main-wam/sample";
import { mainWamPath, praWamPath } from "@/lib/routes";

export const dynamic = "force-dynamic";

const pemaparan = { id: sampleSession("pemaparan").id, title: "Pemaparan departemen", place: "Aula Utama" };
const outcome = (value: CheckInOutcome) => value;
const SAMPLE_TEXT = "Rapat mingguan terlalu panjang. Usul: maksimal 30 menit dan notulen dikirim hari itu juga.";

function awardCards(now: Date, withWinner: boolean) {
  const nominees = sampleNominees();
  const approvals = withWinner ? sampleApprovals(true) : {};
  const voted = new Set([sampleAwards[1].id]);
  return sampleAwards.map(category => {
    const card = voteCard(category, voted.has(category.id), approvals[category.id], now);
    return { id: category.id, title: category.title, method: category.method, card, winner: card.kind === "diumumkan" ? nominees[card.nomineeId] : null };
  });
}

/** As the server sends it: counts of closed voting only (audit M1). */
function approvalData(withSuportif: boolean, now = at("2027-01-06", "16:00")) {
  const counts = new Map(Object.entries(sampleCounts()).map(([id, map]) => [id, new Map(Object.entries(map))]));
  return {
    categories: sampleAwards, counts: closedCounts(sampleAwards, counts, now), nominees: sampleNominees(), approvals: sampleApprovals(withSuportif),
    names: { [samplePeople.wulan.id]: "Wulan", [samplePeople.arman.id]: "Arman" }, me: samplePeople.arman.id,
  };
}

/** Every screen and state of agen D, in the real frame: ?layar=<ID>. */
const SCREENS: Record<string, { path: string; peran?: string; render: () => ReactNode }> = {
  A01: { path: mainWamPath.scan, render: () => <Scanner preview="kamera" contact={sampleContact} current={{ title: "Pemaparan departemen", place: "Aula Utama", until: "12.30" }} /> },
  "A01-offline": { path: mainWamPath.scan, render: () => <Scanner preview="offline" contact={sampleContact} current={{ title: "Pemaparan departemen", place: "Aula Utama", until: "12.30" }} /> },
  "A01-bukan": { path: mainWamPath.scan, render: () => <Scanner preview="bukan-wam" contact={sampleContact} current={{ title: "Pemaparan departemen", place: "Aula Utama", until: "12.30" }} /> },
  A02: { path: mainWamPath.checkIn("x"), render: () => <CheckInResultView contact={sampleContact} now={at("2027-01-05", "07:52")} outcome={outcome({ kind: "tercatat", session: pemaparan, checkedInAt: at("2027-01-05", "07:52").toISOString() })} /> },
  "A02-sudah": { path: mainWamPath.checkIn("x"), render: () => <CheckInResultView contact={sampleContact} now={at("2027-01-05", "08:30")} outcome={outcome({ kind: "sudah", session: pemaparan, checkedInAt: at("2027-01-05", "07:52").toISOString() })} /> },
  "A02-offline": { path: mainWamPath.checkIn("x"), render: () => <OfflineSaved title="Pemaparan departemen" scannedAt={at("2027-01-05", "07:52").toISOString()} now={at("2027-01-05", "07:52")} /> },
  A03: { path: mainWamPath.checkIn("x"), render: () => <CheckInResultView contact={sampleContact} now={at("2027-01-05", "08:05")}
    outcome={outcome({ kind: "belum", session: { ...pemaparan, title: "Silent Meeting" }, opens: at("2027-01-05", "12:30").toISOString(), closes: at("2027-01-05", "15:30").toISOString() })} /> },
  A04: { path: mainWamPath.checkIn("x"), render: () => <CheckInResultView contact={sampleContact} now={at("2027-01-04", "18:40")}
    outcome={outcome({ kind: "tutup", session: { ...pemaparan, title: "Pembukaan: Shaping Tomorrow" }, closes: at("2027-01-04", "18:30").toISOString() })} /> },
  "A04-kontak": { path: mainWamPath.checkIn("x"), render: () => <CheckInResultView contact={sampleContact} now={at("2027-01-04", "18:40")} initialContact
    outcome={outcome({ kind: "tutup", session: { ...pemaparan, title: "Pembukaan: Shaping Tomorrow" }, closes: at("2027-01-04", "18:30").toISOString() })} /> },
  "A04-lain": { path: mainWamPath.checkIn("x"), render: () => <CheckInResultView contact={sampleContact} now={at("2027-01-05", "08:05")} outcome={outcome({ kind: "tidak-dikenal" })} /> },
  A05: { path: mainWamPath.scan, render: () => <Scanner preview="ditolak" contact={sampleContact} current={null} /> },
  T01: { path: mainWamPath.silentMeeting(), render: () => <SilentForm view={sampleSilentView("buka")} remaining={10} preview={{ body: SAMPLE_TEXT, topic: "Cara kerja" }} /> },
  "T01-kosong": { path: mainWamPath.silentMeeting(), render: () => <SilentForm view={sampleSilentView("buka")} remaining={10} preview={{}} /> },
  "T01-mengirim": { path: mainWamPath.silentMeeting(), render: () => <SilentForm view={sampleSilentView("buka")} remaining={10} preview={{ body: SAMPLE_TEXT, topic: "Cara kerja", sending: true }} /> },
  "T01-offline": { path: mainWamPath.silentMeeting(), render: () => <SilentForm view={sampleSilentView("buka")} remaining={10} preview={{ body: SAMPLE_TEXT, topic: "Cara kerja", offline: true }} /> },
  "T01-buang": { path: mainWamPath.silentMeeting(), render: () => <SilentForm view={sampleSilentView("buka")} remaining={10} preview={{ body: SAMPLE_TEXT, topic: "Cara kerja", dialog: "buang" }} /> },
  "T01-ditutup": { path: mainWamPath.silentMeeting(), render: () => <SilentForm view={sampleSilentView("buka")} remaining={10} preview={{ body: SAMPLE_TEXT, topic: "Cara kerja", dialog: "ditutup" }} /> },
  T02: { path: mainWamPath.silentMeeting(), render: () => <SilentForm view={sampleSilentView("buka")} remaining={10} preview={{ sent: true }} /> },
  T03: { path: mainWamPath.silentMeeting(), render: () => <SilentClosed count={47} /> },
  "T03-kurang": { path: mainWamPath.silentMeeting(), render: () => <SilentClosed count={null} /> },
  "T03-belum": { path: mainWamPath.silentMeeting(), render: () => <SilentNotYet view={sampleSilentView("belum")} now={at("2027-01-05", "10:05")} /> },
  "T03-bod": { path: mainWamPath.silentMeeting(), peran: "bod", render: () => <SilentForBod view={sampleSilentView("tutup")} count={47} /> },
  V01: { path: mainWamPath.awards, render: () => <AwardList now={at("2027-01-06", "10:00")} canVote banner="Diumumkan di Gala Dinner · 19.00" categories={awardCards(at("2027-01-06", "10:00"), false)} /> },
  "V01-diumumkan": { path: mainWamPath.awards, render: () => <AwardList now={at("2027-01-06", "19:40")} canVote banner={null} categories={awardCards(at("2027-01-06", "19:40"), true)} /> },
  "V01-kosong": { path: mainWamPath.awards, render: () => <AwardList now={at("2027-01-06", "10:00")} canVote banner={null} categories={[]} /> },
  V02: { path: mainWamPath.awardCategory(sampleAwards[0].id), render: () => <NomineePicker now={at("2027-01-06", "10:01")} current={null} preview={{ choice: sampleAwards[0].nominees[0].id }}
    nominees={sampleAwards[0].nominees.map(nominee => sampleNominees()[nominee.id])}
    category={{ id: sampleAwards[0].id, title: sampleAwards[0].title, description: "Siapa yang paling banyak membantu orang lain tahun ini?", closesAt: sampleAwards[0].closesAt! }} /> },
  B05: { path: mainWamPath.silentRecap, peran: "bod", render: () => <SilentRecapView recap={sampleRecap(true)} /> },
  "B05-kurang": { path: mainWamPath.silentRecap, peran: "bod", render: () => <SilentRecapView recap={sampleRecap(false)} /> },
  "B05-buka": { path: mainWamPath.silentRecap, peran: "bod", render: () => <SilentRecapView recap={sampleRecap("buka")} /> },
  B06: { path: mainWamPath.awardApproval, peran: "bod", render: () => <AwardApproval now={at("2027-01-06", "16:00").toISOString()} data={approvalData(false)} /> },
  "B06-setujui": { path: mainWamPath.awardApproval, peran: "bod", render: () => <AwardApproval now={at("2027-01-06", "16:02").toISOString()} data={approvalData(false)} preview={{ confirm: sampleAwards[0].id }} /> },
  "B06-disetujui": { path: mainWamPath.awardApproval, peran: "bod", render: () => <AwardApproval now={at("2027-01-06", "16:02").toISOString()} data={approvalData(true)} /> },
  "B06-buka": { path: mainWamPath.awardApproval, peran: "bod", render: () => <AwardApproval now={at("2027-01-06", "10:00").toISOString()} data={approvalData(false, at("2027-01-06", "10:00"))} /> },
  P04: { path: mainWamPath.session(pemaparan.id), peran: "panitia", render: () => <ScreenContent>
    <ScreenSection label="Absen dibuka"><SectionHeader title="Absen dibuka" /><AbsenView slot={{ kind: "buka", closes: at("2027-01-05", "12:30").toISOString() }} /></ScreenSection>
    <ScreenSection label="Sudah absen"><SectionHeader title="Sudah absen" /><AbsenView slot={{ kind: "hadir", at: at("2027-01-05", "07:52").toISOString() }} /></ScreenSection>
    <ScreenSection label="Lewat tanpa absen"><SectionHeader title="Lewat tanpa absen" /><AbsenView slot={{ kind: "terlewat", contact: sampleContact }} /></ScreenSection>
    <ScreenSection label="BOD"><SectionHeader title="BOD" /><AbsenView slot={{ kind: "bod", present: 96, expected: 120 }} /></ScreenSection>
    <ScreenSection label="Silent Meeting dibuka"><SectionHeader title="Silent Meeting dibuka" /><ModuleActionView slot={{ action: { kind: "silent-buka", href: mainWamPath.silentMeeting(), closesAt: at("2027-01-05", "15:00").toISOString() }, qr: null }} /></ScreenSection>
    <ScreenSection label="Silent Meeting ditutup"><SectionHeader title="Silent Meeting ditutup" /><ModuleActionView slot={{ action: { kind: "silent-tutup", href: mainWamPath.silentMeeting() }, qr: null }} /></ScreenSection>
    <ScreenSection label="Voting dibuka"><SectionHeader title="Voting dibuka" /><ModuleActionView slot={{ action: { kind: "link", label: "Pilih nominasi", href: mainWamPath.awards, icon: "trophy", primary: true }, qr: null }} /></ScreenSection>
    <ScreenSection label="Survei"><SectionHeader title="Survei" /><ModuleActionView slot={{ action: { kind: "link", label: "Isi survei", href: praWamPath.questionnaire("survei-wam"), icon: "survei", primary: true }, qr: null }} /></ScreenSection>
    <ScreenSection label="Panitia"><SectionHeader title="Panitia: QR absen" /><ModuleActionView slot={{ action: null, qr: { sessionId: pemaparan.id } }} /></ScreenSection>
  </ScreenContent> },
  tunggu: { path: mainWamPath.awards, render: () => <Waiting /> },
};

/**
 * Agen D's screens with sample data, no sign-in, 404 in production: ?layar=A01|A01-offline|A01-bukan|
 * A02|A02-sudah|A02-offline|A03|A04|A04-kontak|A04-lain|A05|T01|T01-kosong|T01-mengirim|T01-offline|
 * T01-buang|T01-ditutup|T02|T03|T03-kurang|T03-belum|T03-bod|V01|V01-diumumkan|V01-kosong|V02|B05|
 * B05-kurang|B05-buka|B06|B06-buka|B06-setujui|B06-disetujui|P04|tunggu.
 */
export default async function DevMainWamModul({ searchParams }: { searchParams: Promise<{ layar?: string; lang?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const params = await searchParams;
  const { layar } = params;
  const screen = SCREENS[layar ?? "A01"] ?? SCREENS.A01;
  return <DevFrame path={screen.path} peran={screen.peran} lang={previewLang(params)}>{screen.render()}</DevFrame>;
}
