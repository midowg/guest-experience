import { notFound } from "next/navigation";
import { ConsoleTheme } from "@/components/console";
import { ClockInFlow } from "@/components/hr/ClockInFlow";
import { HrFrame } from "@/components/hr/HrFrame";
import { ManageAttendance } from "@/components/hr/ManageAttendance";
import { ManageOffices } from "@/components/hr/ManageOffices";
import { jakarta } from "@/components/hr/font";
import hr from "@/components/hr/hr.module.css";
import type { ClockInState, DailyRecord, DayView, FaceRow } from "@/lib/hr/attendance";

export const dynamic = "force-dynamic";

// Made-up people and a made-up office point (not a real address).
const office = { id: "o1", name: "Kantor Contoh", lat: -7.78, lng: 110.36, radiusM: 100, zone: "WIB" as const };
const record = (patch: Partial<DailyRecord>): DailyRecord => ({
  id: "r1", kind: "masuk", at: "2026-11-20T01:52:00Z", workDate: "2026-11-20", method: "wajah", status: "sah", flags: [], officeName: "Kantor Contoh",
  distanceM: 35, accuracyM: 12, faceScore: 0.61, reasonKind: null, reasonText: null, hasSelfie: false, reviewNote: null, ...patch,
});
const state: ClockInState = {
  ready: true, waiting: null, face: { status: "aktif", source: "greatday", consented: true },
  today: { workDate: "2026-11-20", masuk: record({}), pulang: null },
  offices: [office],
  recent: [
    record({}),
    record({ id: "r2", workDate: "2026-11-19", at: "2026-11-19T02:05:00Z" }),
    record({ id: "r3", workDate: "2026-11-19", kind: "pulang", at: "2026-11-19T10:31:00Z" }),
    record({ id: "r4", workDate: "2026-11-18", at: "2026-11-18T01:40:00Z", status: "perlu_cek", flags: ["di_luar_area"], reasonKind: "event", reasonText: "Venue klien", officeName: null, distanceM: 8200 }),
  ],
};
const day: DayView = {
  date: "2026-11-20", offices: [office],
  people: [
    { employeeId: "e1", name: "Contoh Satu", department: "Center of Excellence", face: "aktif", masuk: record({}), pulang: null },
    { employeeId: "e2", name: "Contoh Dua", department: "Event Production", face: "aktif", masuk: record({ id: "r5", status: "perlu_cek", flags: ["di_luar_area"], reasonKind: "event", reasonText: "Venue klien", distanceM: 8200, faceScore: 0.55 }), pulang: null },
    { employeeId: "e3", name: "Contoh Tiga", department: "Human Resources & General Affair", face: "siap", masuk: null, pulang: null },
    { employeeId: "e4", name: "Contoh Empat", department: "Finance", face: null, masuk: record({ id: "r6", method: "manual", faceScore: null, distanceM: null, accuracyM: null, officeName: null, reviewNote: "HP rusak" }), pulang: null },
  ],
};
const faces: FaceRow[] = [
  { employeeId: "e1", name: "Contoh Satu", department: "Center of Excellence", status: "aktif", source: "greatday", note: null, consented: true, hasPhoto: true, hasEmbedding: true, updatedAt: "2026-11-20T01:00:00Z" },
  { employeeId: "e2", name: "Contoh Dua", department: "Event Production", status: "menunggu", source: "daftar", note: "Tidak cocok dengan foto GreatDay", consented: true, hasPhoto: true, hasEmbedding: true, updatedAt: "2026-11-20T01:00:00Z" },
  { employeeId: "e3", name: "Contoh Tiga", department: "Human Resources & General Affair", status: "impor", source: "greatday", note: null, consented: false, hasPhoto: true, hasEmbedding: false, updatedAt: "2026-11-20T01:00:00Z" },
];

/**
 * Layout check for HR Werkudara without signing in (20 Nov 2026), with made-up data. Default: Absen;
 * ?kelola=absen or ?kelola=kantor: Kelola. Its buttons call the real API, which refuses without a session.
 */
export default async function DevHrPage({ searchParams }: { searchParams: Promise<{ kelola?: string; kosong?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { kelola, kosong } = await searchParams;
  const initial = kosong ? { ...state, face: null, today: { ...state.today, masuk: null }, recent: [] } : state;
  return <div className={`${jakarta.variable} ${hr.theme}`}><HrFrame name="Contoh Satu" canManage>
    {kelola
      ? <ConsoleTheme canvas className={hr.manage}>{kelola === "kantor" ? <ManageOffices initial={[{ ...office, active: true }]} /> : <ManageAttendance initial={day} faces={faces} />}</ConsoleTheme>
      : <div className={hr.narrow}><ClockInFlow initial={initial} name="Contoh" now="2026-11-20T02:41:00.000Z" /></div>}
  </HrFrame></div>;
}
