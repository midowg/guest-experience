import { notFound } from "next/navigation";
import { ClockInFlow, type ClockInDetail, type ClockInStep } from "@/components/hr/ClockInFlow";
import { HrFrame } from "@/components/hr/HrFrame";
import { jakarta } from "@/components/hr/font";
import hr from "@/components/hr/hr.module.css";
import type { ClockInState, DailyRecord } from "@/lib/hr/attendance";

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
  requests: [
    { id: "q1", type: "tambah", status: "menunggu", workDate: "2026-11-19", kind: "pulang", recordId: null, proposedTime: "17:30", zone: "WIB", reasonKind: null, reasonText: null, note: "HP mati waktu pulang", decisionNote: null, decidedLabel: null, createdAt: "2026-11-20T02:00:00Z" },
    { id: "q2", type: "ubah_jam", status: "disetujui", workDate: "2026-11-12", kind: "masuk", recordId: "2026-11-12-m", proposedTime: "08:15", zone: "WIB", reasonKind: null, reasonText: null, note: "Sudah di kantor, aplikasi lambat", decisionNote: "Sesuai CCTV lobi.", decidedLabel: "Admin Contoh", createdAt: "2026-11-12T03:00:00Z" },
  ],
};
/**
 * Layout check for WG People's employee screens without signing in (20 Nov 2026), with made-up
 * data; ?kosong=1 for someone without a face or a clock-in yet, ?langkah=hasil|rendah|lokasi|revisi|persetujuan|gagal|kirim
 * for one sheet step, ?detail=hari|pengajuan|wajah|kantor for a detail screen (on Beranda). The
 * bottom menu works as in the app. Its buttons call the real API, which refuses without a session.
 */
export default async function DevHrPage({ searchParams }: { searchParams: Promise<{ kosong?: string; langkah?: string; detail?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { kosong, langkah, detail } = await searchParams;
  const steps: Record<string, ClockInStep> = {
    hasil: { name: "hasil", title: "Tercatat. Hati-hati di jalan!", record: record({ id: "r9", kind: "pulang", at: "2026-11-20T10:12:00Z", faceScore: 0.47 }), note: null, then: null },
    rendah: { name: "hasil", title: "Tercatat, Admin HR akan memeriksanya", record: record({ id: "r9", kind: "pulang", at: "2026-11-20T10:12:00Z", faceScore: 0.33, status: "perlu_cek", flags: ["skor_rendah"] }), note: "Perlu dicek Admin HR: kecocokan wajah rendah.", then: null },
    lokasi: { name: "lokasi", kind: "pulang", consent: null },
    revisi: { name: "revisi", date: "2026-11-19" },
    persetujuan: { name: "persetujuan", then: "daftar" },
    gagal: { name: "gagal", text: "Wajah belum cocok dengan foto acuan (kecocokan 61%, perlu sekitar 76%). Cari tempat terang, lalu coba lagi.", retry: { name: "ringkas" } },
    kirim: { name: "kirim", text: "Mengirim absen…", since: Date.parse("2026-11-20T02:41:00Z") },
  };
  const details: Record<string, ClockInDetail> = {
    hari: { kind: "hari", date: "2026-11-18", tab: "beranda" },
    pengajuan: { kind: "pengajuan", id: "q2", tab: "beranda" },
    wajah: { kind: "wajah", tab: "beranda" },
    kantor: { kind: "kantor", tab: "beranda" },
  };
  const initial = kosong ? { ...state, face: null, today: { ...state.today, masuk: null }, recent: [], requests: [] } : state;
  return <div className={`${jakarta.variable} ${hr.theme}`}><HrFrame>
    <ClockInFlow initial={initial} name="Contoh" fullName="Contoh Satu" now="2026-11-20T02:41:00.000Z" preview
      initialStep={langkah ? steps[langkah] : undefined} initialDetail={detail ? details[detail] : undefined} />
  </HrFrame></div>;
}
