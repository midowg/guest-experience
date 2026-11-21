import { notFound } from "next/navigation";
import { ClockInFlow, type ClockInDetail, type ClockInStep } from "@/components/hr/ClockInFlow";
import { HrFrame } from "@/components/hr/HrFrame";
import { jakarta } from "@/components/hr/font";
import hr from "@/components/hr/hr.module.css";
import { LangProvider } from "@/components/hr/lang";
import { copies } from "@/lib/hr/copy";
import { asLang } from "@/lib/hr/lang";
import type { ClockInState, DailyRecord } from "@/lib/hr/attendance";
import type { TeamLeave } from "@/lib/hr/leave";

export const dynamic = "force-dynamic";

// Made-up people and a made-up office point (not a real address).
const office = { id: "o1", name: "Kantor Contoh", lat: -7.78, lng: 110.36, radiusM: 100, zone: "WIB" as const };
const record = (patch: Partial<DailyRecord>): DailyRecord => ({
  id: "r1", kind: "masuk", at: "2026-11-20T01:52:00Z", workDate: "2026-11-20", method: "wajah", status: "sah", flags: [], officeName: "Kantor Contoh",
  distanceM: 35, accuracyM: 12, faceScore: 0.61, reasonKind: null, reasonText: null, hasSelfie: false, reviewNote: null, faceMethod: "foto", ...patch,
});
const day = (date: string, inAt: string, outAt: string | null, patch: Partial<DailyRecord> = {}): DailyRecord[] => [
  record({ id: `${date}-m`, workDate: date, at: `${date}T${inAt}:00Z`, ...patch }),
  ...(outAt ? [record({ id: `${date}-p`, workDate: date, kind: "pulang", at: `${date}T${outAt}:00Z`, faceScore: 0.55 })] : []),
];
const state: ClockInState = {
  ready: true, waiting: null, face: { status: "aktif", source: "greatday", consented: true },
  today: { workDate: "2026-11-20", masuk: record({}), pulang: null },
  offices: [office],
  recent: [
    record({}),
    ...day("2026-11-19", "02:05", null),
    ...day("2026-11-18", "01:40", "10:20", { status: "perlu_cek", flags: ["di_luar_area"], reasonKind: "event", reasonText: "Venue klien", officeName: null, distanceM: 8200 }),
    ...day("2026-11-17", "01:31", "10:45"),
    ...day("2026-11-16", "01:58", "11:02"),
    ...day("2026-11-13", "01:47", "10:39"),
    ...day("2026-11-12", "02:12", "10:58"),
    ...day("2026-11-11", "01:36", "10:30"),
  ],
  method: "foto",
  leaves: [
    { id: "l1", type: "cuti", startDate: "2026-11-25", endDate: "2026-11-27", note: "Pulang kampung, acara keluarga", status: "menunggu", decidedLabel: null, decisionNote: null, createdAt: "2026-11-19T03:00:00Z" },
    { id: "l2", type: "sakit", startDate: "2026-11-10", endDate: "2026-11-10", note: "Demam", status: "disetujui", decidedLabel: "Admin Contoh", decisionNote: null, createdAt: "2026-11-10T01:00:00Z" },
  ],
  requests: [
    { id: "q1", type: "tambah", status: "menunggu", workDate: "2026-11-19", kind: "pulang", recordId: null, proposedTime: "17:30", zone: "WIB", reasonKind: null, reasonText: null, note: "HP mati waktu pulang", decisionNote: null, decidedLabel: null, createdAt: "2026-11-20T02:00:00Z" },
    { id: "q2", type: "ubah_jam", status: "disetujui", workDate: "2026-11-12", kind: "masuk", recordId: "2026-11-12-m", proposedTime: "08:15", zone: "WIB", reasonKind: null, reasonText: null, note: "Sudah di kantor, aplikasi lambat", decisionNote: "Sesuai CCTV lobi.", decidedLabel: "Admin Contoh", createdAt: "2026-11-12T03:00:00Z" },
  ],
};
// A made-up team month for Tim.
const team: TeamLeave[] = [
  { id: "t1", employeeId: "e1", name: "Contoh Satu", department: "Center of Excellence", type: "cuti", startDate: "2026-11-25", endDate: "2026-11-27", status: "menunggu", mine: true },
  { id: "t2", employeeId: "e2", name: "Contoh Dua", department: "Event Production", type: "dinas", startDate: "2026-11-18", endDate: "2026-11-21", status: "disetujui", mine: false },
  { id: "t3", employeeId: "e3", name: "Contoh Tiga", department: "Finance", type: "sakit", startDate: "2026-11-20", endDate: "2026-11-20", status: "disetujui", mine: false },
  { id: "t4", employeeId: "e4", name: "Contoh Empat", department: "Center of Excellence", type: "izin", startDate: "2026-11-20", endDate: "2026-11-20", status: "menunggu", mine: false },
  { id: "t5", employeeId: "e5", name: "Contoh Lima", department: "Human Resources & General Affair", type: "cuti", startDate: "2026-11-03", endDate: "2026-11-07", status: "disetujui", mine: false },
  { id: "t6", employeeId: "e6", name: "Contoh Enam", department: "Finance", type: "dinas", startDate: "2026-11-20", endDate: "2026-11-22", status: "disetujui", mine: false },
];
/**
 * Layout check for WG People's employee screens without signing in (20 Nov 2026), with made-up
 * data; ?kosong=1 for someone without a face or a clock-in yet, ?langkah=hasil|rendah|lokasi|revisi|persetujuan|gagal|kirim
 * for one sheet step, ?detail=hari|pengajuan|wajah|bantuan for a detail screen (on Beranda), ?tema=gelap,
 * ?bahasa=id (English otherwise), ?jam=HH:MM (UTC) for another time of the made-up day. The
 * bottom menu works as in the app. Its buttons call the real API, which refuses without a session.
 */
export default async function DevHrPage({ searchParams }: { searchParams: Promise<{ kosong?: string; langkah?: string; detail?: string; tema?: string; bahasa?: string; jam?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { kosong, langkah, detail, tema, bahasa, jam } = await searchParams;
  const theme = tema === "gelap" ? "gelap" : "terang";
  const lang = asLang(bahasa), t = copies[lang];
  const now = jam && /^\d{2}:\d{2}$/.test(jam) ? `2026-11-20T${jam}:00.000Z` : "2026-11-20T02:41:00.000Z";
  const steps: Record<string, ClockInStep> = {
    hasil: { name: "hasil", title: t.flow.warm.pulang, record: record({ id: "r9", kind: "pulang", at: "2026-11-20T10:12:00Z", faceScore: 0.47 }), note: null, then: null },
    rendah: { name: "hasil", title: t.flow.warm.cek, record: record({ id: "r9", kind: "pulang", at: "2026-11-20T10:12:00Z", faceScore: 0.33, status: "perlu_cek", flags: ["skor_rendah"] }), note: t.flow.reviewNote(t.flags.skor_rendah.toLowerCase()), then: null },
    lokasi: { name: "lokasi", kind: "pulang", consent: null },
    revisi: { name: "revisi", date: "2026-11-19" },
    persetujuan: { name: "persetujuan", then: "daftar" },
    gagal: { name: "gagal", text: t.server("Wajah belum cocok dengan foto acuan (kecocokan 61%, perlu sekitar 76%). Cari tempat terang, lihat lurus ke kamera, lalu coba lagi."), retry: { name: "ringkas" } },
    kirim: { name: "kirim", text: t.flow.sendingRecord, since: Date.parse("2026-11-20T02:41:00Z") },
  };
  const details: Record<string, ClockInDetail> = {
    hari: { kind: "hari", date: "2026-11-18", tab: "beranda" },
    pengajuan: { kind: "pengajuan", id: "q2", tab: "beranda" },
    wajah: { kind: "wajah", tab: "beranda" },
    bantuan: { kind: "bantuan", tab: "beranda" },
  };
  const initial = kosong ? { ...state, face: null, today: { ...state.today, masuk: null }, recent: [], requests: [], leaves: [] } : state;
  return <div id="wg-tema" className={`${jakarta.variable} ${hr.theme}`} data-tema={theme} lang={lang}><LangProvider initial={lang}><HrFrame>
    <ClockInFlow initial={initial} name="Contoh" fullName="Contoh Satu" now={now} preview previewTeam={team} theme={theme}
      initialStep={langkah ? steps[langkah] : undefined} initialDetail={detail ? details[detail] : undefined} />
  </HrFrame></LangProvider></div>;
}
