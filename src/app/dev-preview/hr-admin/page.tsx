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
import { cellOf, type DayTable, type MonthTable } from "@/lib/hr/recap";
import type { AdminLeave, LeaveType } from "@/lib/hr/leave";
import { LeaveQueue } from "@/components/hr-admin/LeaveQueue";
import { MonthRecap } from "@/components/hr-admin/MonthRecap";
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
const dayView: DayView = {
  date: "2026-11-20", offices: [office],
  people: [
    { employeeId: "e1", name: "Contoh Satu", department: "Center of Excellence", face: "aktif", masuk: record({}), pulang: null },
    { employeeId: "e2", name: "Contoh Dua", department: "Event Production", face: "aktif", masuk: waiting[0], pulang: null },
    { employeeId: "e5", name: "Contoh Lima", department: "Human Resources & General Affair", face: "siap", masuk: null, pulang: null },
    { employeeId: "e6", name: "Contoh Enam", department: "Finance", face: null, masuk: record({ id: "r6", method: "manual", faceScore: null, distanceM: null, accuracyM: null, officeName: null, reviewNote: "HP rusak" }), pulang: null },
  ],
};
// The day with each person's cell, as the server gives it (late after 09.00).
const local = (record: DailyRecord | null) => record ? { ...record, local: new Date(Date.parse(record.at) + 7 * 3_600_000).toISOString().slice(11, 16) } : null;
const leaveSample: AdminLeave[] = [
  { id: "c1", type: "cuti", startDate: "2026-11-24", endDate: "2026-11-26", note: "Pulang kampung, acara keluarga", status: "menunggu", decidedLabel: null, decisionNote: null, createdAt: "2026-11-19T03:00:00Z", employeeId: "e5", name: "Contoh Lima", department: "Human Resources & General Affair" },
  { id: "c2", type: "dinas", startDate: "2026-11-20", endDate: "2026-11-21", note: "Survei venue klien di Surabaya", status: "menunggu", decidedLabel: null, decisionNote: null, createdAt: "2026-11-18T03:00:00Z", employeeId: "e3", name: "Contoh Tiga", department: "Finance" },
  { id: "c3", type: "sakit", startDate: "2026-11-11", endDate: "2026-11-12", note: "Demam", status: "disetujui", decidedLabel: "Admin Contoh", decisionNote: null, createdAt: "2026-11-11T01:00:00Z", employeeId: "e2", name: "Contoh Dua", department: "Event Production" },
];
const leavesOf = (employeeId: string) => leaveSample.filter(leave => leave.employeeId === employeeId && leave.status !== "ditolak").map(leave => ({ type: leave.type as LeaveType, startDate: leave.startDate, endDate: leave.endDate, status: leave.status as "menunggu" | "disetujui" }));
const day: DayTable = { ...dayView, lateAfter: "09:00", leaveReady: true, people: dayView.people.map(person => ({ ...person, cell: cellOf({ date: dayView.date, today: "2026-11-20", lateAfter: "09:00", masuk: local(person.masuk), pulang: local(person.pulang), leaves: leavesOf(person.employeeId) }) })) };
// A made-up month: a mix of on time, late, away and missing days.
const monthDates = Array.from({ length: 30 }, (_, index) => `2026-11-${String(index + 1).padStart(2, "0")}`);
const pattern = (seed: number, date: string) => {
  const n = (Number(date.slice(8)) * 7 + seed * 3) % 11;
  const at = (time: string) => ({ status: "sah" as const, reasonKind: null, officeName: "Kantor Contoh", method: "wajah" as const, local: time });
  if (n === 0) return { masuk: null, pulang: null };
  if (n === 1) return { masuk: at("09:24"), pulang: at("17:40") };
  if (n === 2) return { masuk: { ...at("10:02"), reasonKind: "event" as const, officeName: null }, pulang: null };
  if (n === 3) return { masuk: { ...at("08:40"), status: "perlu_cek" as const }, pulang: at("17:05") };
  if (n === 4) return { masuk: { ...at("09:00"), reasonKind: "wfh" as const, officeName: null }, pulang: at("17:00") };
  return { masuk: at(`08:${String(30 + n * 2).padStart(2, "0")}`), pulang: at("17:30") };
};
const month: MonthTable = {
  month: "2026-11", today: "2026-11-20", lateAfter: "09:00", leaveReady: true, since: "2026-11-02", dates: monthDates,
  people: ["Contoh Satu", "Contoh Dua", "Contoh Tiga", "Contoh Empat", "Contoh Lima", "Contoh Enam"].map((name, seed) => ({
    employeeId: `e${seed + 1}`, name, department: ["Center of Excellence", "Event Production", "Finance", "Center of Excellence", "Human Resources & General Affair", "Finance"][seed],
    cells: monthDates.map(date => cellOf({ date, today: "2026-11-20", lateAfter: "09:00", ...(date > "2026-11-20" ? { masuk: null, pulang: null } : pattern(seed, date)), leaves: leavesOf(`e${seed + 1}`) })),
  })),
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

/** Layout check for Admin HR without signing in (20 Nov 2026), with made-up data: ?bagian=ringkasan|perlu|revisi|cuti|absen|rekap|wajah|kantor. Its buttons call the real API, which refuses without a session. */
export default async function DevHrAdminPage({ searchParams }: { searchParams: Promise<{ bagian?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { bagian } = await searchParams;
  const current = (["perlu", "revisi", "cuti", "absen", "rekap", "wajah", "kantor"].includes(bagian ?? "") ? bagian : "ringkasan") as HrAdminSectionKey;
  return <HrAdminNav current={current} superAdmin waiting={waiting.length} requests={2} leaves={2} className={admin.shell} personName="Super admin">
    {current === "revisi" && <RequestQueue initial={requests} />}
    {current === "ringkasan" && <HrOverview summary={summary} waiting={waiting} superAdmin late={{ time: "09:00", ready: true, leaves: 2 }} />}
    {current === "cuti" && <LeaveQueue initial={leaveSample} />}
    {current === "rekap" && <MonthRecap initial={month} />}
    {current === "perlu" && <ReviewQueue initial={waiting} />}
    {current === "absen" && <DayAttendance initial={day} today="2026-11-20" />}
    {current === "wajah" && <FaceList initial={faces} candidates={[
      { employeeId: "e6", name: "Contoh Enam", department: "Finance", hasFace: false },
      { employeeId: "e7", name: "Contoh Tujuh", department: "Event Production", hasFace: false },
      { employeeId: "e1", name: "Contoh Satu", department: "Center of Excellence", hasFace: true },
      { employeeId: "e4", name: "Contoh Empat", department: "Center of Excellence", hasFace: true },
    ]} />}
    {current === "kantor" && <OfficePoints initial={[{ ...office, active: true }]} />}
  </HrAdminNav>;
}
