import { notFound } from "next/navigation";
import admin from "@/components/admin/admin.module.css";
import { DayAttendance } from "@/components/hr-admin/DayAttendance";
import { FaceList } from "@/components/hr-admin/FaceList";
import { HrAdminNav } from "@/components/hr-admin/HrAdminNav";
import { HrOverview } from "@/components/hr-admin/HrOverview";
import { OfficePoints } from "@/components/hr-admin/OfficePoints";
import { ReviewQueue } from "@/components/hr-admin/ReviewQueue";
import type { HrAdminSectionKey } from "@/components/hr-admin/sections";
import type { AdminRequest, DailyRecord, DayView, FaceRow, HrSummary, WaitingRecord } from "@/lib/hr/attendance";
import { RequestQueue } from "@/components/hr-admin/RequestQueue";

export const dynamic = "force-dynamic";

// Made-up people and a made-up office point (not a real address).
const office = { id: "o1", name: "Kantor Contoh", lat: -7.78, lng: 110.36, radiusM: 100, zone: "WIB" as const };
const record = (patch: Partial<DailyRecord>): DailyRecord => ({
  id: "r1", kind: "masuk", at: "2026-11-20T01:52:00Z", workDate: "2026-11-20", method: "wajah", status: "sah", flags: [], officeName: "Kantor Contoh",
  distanceM: 35, accuracyM: 12, faceScore: 0.61, reasonKind: null, reasonText: null, hasSelfie: false, reviewNote: null, ...patch,
});
const waiting: WaitingRecord[] = [
  { ...record({ id: "w1", status: "perlu_cek", flags: ["di_luar_area"], reasonKind: "event", reasonText: "Venue klien", officeName: "Kantor Contoh", distanceM: 8200, faceScore: 0.55 }), employeeId: "e2", name: "Contoh Dua", department: "Event Production", face: "aktif" },
  { ...record({ id: "w2", status: "perlu_cek", flags: ["skor_rendah"], faceScore: 0.32, at: "2026-11-19T01:40:00Z", workDate: "2026-11-19" }), employeeId: "e3", name: "Contoh Tiga", department: "Finance", face: "aktif" },
  { ...record({ id: "w3", kind: "pulang", status: "perlu_cek", flags: ["belum_absen_masuk"], at: "2026-11-19T10:10:00Z", workDate: "2026-11-19" }), employeeId: "e4", name: "Contoh Empat", department: "Center of Excellence", face: "menunggu" },
];
const day: DayView = {
  date: "2026-11-20", offices: [office],
  people: [
    { employeeId: "e1", name: "Contoh Satu", department: "Center of Excellence", face: "aktif", masuk: record({}), pulang: null },
    { employeeId: "e2", name: "Contoh Dua", department: "Event Production", face: "aktif", masuk: waiting[0], pulang: null },
    { employeeId: "e5", name: "Contoh Lima", department: "Human Resources & General Affair", face: "siap", masuk: null, pulang: null },
    { employeeId: "e6", name: "Contoh Enam", department: "Finance", face: null, masuk: record({ id: "r6", method: "manual", faceScore: null, distanceM: null, accuracyM: null, officeName: null, reviewNote: "HP rusak" }), pulang: null },
  ],
};
const faces: FaceRow[] = [
  { employeeId: "e1", name: "Contoh Satu", department: "Center of Excellence", status: "aktif", source: "greatday", note: null, consented: true, hasPhoto: true, hasEmbedding: true, updatedAt: "2026-11-20T01:00:00Z" },
  { employeeId: "e4", name: "Contoh Empat", department: "Center of Excellence", status: "menunggu", source: "daftar", note: "Tidak cocok dengan foto GreatDay", consented: true, hasPhoto: true, hasEmbedding: true, updatedAt: "2026-11-20T01:00:00Z" },
  { employeeId: "e5", name: "Contoh Lima", department: "Human Resources & General Affair", status: "impor", source: "greatday", note: null, consented: false, hasPhoto: true, hasEmbedding: false, updatedAt: "2026-11-20T01:00:00Z" },
];
const summary: HrSummary = { date: "2026-11-20", people: 71, masuk: 38, pulang: 5, belum: 33, diLuar: 4, waiting: waiting.length, requests: 1, method: "gerakan", offices: 0, faces: { aktif: 3, siap: 0, impor: 49, menunggu: 1, ditolak: 0, tanpa: 18 } };

const requests: AdminRequest[] = [
  { id: "q1", type: "tambah", status: "menunggu", workDate: "2026-11-19", kind: "pulang", recordId: null, proposedTime: "17:30", zone: "WIB", reasonKind: null, reasonText: null, note: "HP mati waktu pulang", decisionNote: null, decidedLabel: null, createdAt: "2026-11-20T02:00:00Z", employeeId: "e3", name: "Contoh Tiga", department: "Finance", record: null },
  { id: "q2", type: "ubah_jam", status: "menunggu", workDate: "2026-11-20", kind: "masuk", recordId: "r1", proposedTime: "08:15", zone: "WIB", reasonKind: null, reasonText: null, note: "Antre lift, absen terlambat", decisionNote: null, decidedLabel: null, createdAt: "2026-11-20T03:00:00Z", employeeId: "e1", name: "Contoh Satu", department: "Center of Excellence", record: record({}) },
  { id: "q3", type: "batal", status: "disetujui", workDate: "2026-11-18", kind: "masuk", recordId: null, proposedTime: null, zone: "WIB", reasonKind: null, reasonText: null, note: "Salah tekan", decisionNote: null, decidedLabel: "Super admin", createdAt: "2026-11-19T03:00:00Z", employeeId: "e2", name: "Contoh Dua", department: "Event Production", record: null },
];

/** Layout check for Admin HR without signing in (20 Nov 2026), with made-up data: ?bagian=ringkasan|perlu|absen|wajah|kantor. Its buttons call the real API, which refuses without a session. */
export default async function DevHrAdminPage({ searchParams }: { searchParams: Promise<{ bagian?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { bagian } = await searchParams;
  const current = (["perlu", "revisi", "absen", "wajah", "kantor"].includes(bagian ?? "") ? bagian : "ringkasan") as HrAdminSectionKey;
  return <HrAdminNav current={current} superAdmin waiting={waiting.length} requests={2} className={admin.shell} personName="Super admin">
    {current === "revisi" && <RequestQueue initial={requests} />}
    {current === "ringkasan" && <HrOverview summary={summary} waiting={waiting} superAdmin />}
    {current === "perlu" && <ReviewQueue initial={waiting} />}
    {current === "absen" && <DayAttendance initial={day} today="2026-11-20" />}
    {current === "wajah" && <FaceList initial={faces} />}
    {current === "kantor" && <OfficePoints initial={[{ ...office, active: true }]} />}
  </HrAdminNav>;
}
