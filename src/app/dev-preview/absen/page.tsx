import { notFound } from "next/navigation";
import { ClockInFlow } from "@/components/hr/ClockInFlow";
import { HrFrame } from "@/components/hr/HrFrame";
import { jakarta } from "@/components/hr/font";
import hr from "@/components/hr/hr.module.css";
import type { ClockInState, DailyRecord } from "@/lib/hr/attendance";

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
  method: "foto",
  requests: [
    { id: "q1", type: "tambah", status: "menunggu", workDate: "2026-11-19", kind: "pulang", recordId: null, proposedTime: "17:30", zone: "WIB", reasonKind: null, reasonText: null, note: "HP mati waktu pulang", decisionNote: null, decidedLabel: null, createdAt: "2026-11-20T02:00:00Z" },
  ],
};
/**
 * Layout check for HR Werkudara's employee screen without signing in (20 Nov 2026), with made-up
 * data; ?kosong=1 for someone without a face or a clock-in yet. Admin HR: /dev-preview/hr-admin.
 * Its buttons call the real API, which refuses without a session.
 */
export default async function DevHrPage({ searchParams }: { searchParams: Promise<{ kosong?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { kosong } = await searchParams;
  const initial = kosong ? { ...state, face: null, today: { ...state.today, masuk: null }, recent: [] } : state;
  return <div className={`${jakarta.variable} ${hr.theme}`}><HrFrame name="Contoh Satu">
    <div className={hr.narrow}><ClockInFlow initial={initial} name="Contoh" now="2026-11-20T02:41:00.000Z" /></div>
  </HrFrame></div>;
}
