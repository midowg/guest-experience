import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/shared/AdminShell";
import { PraWamMomCabinet } from "@/components/admin/wam/PraWamMomCabinet";
import { ConsoleTheme } from "@/components/console";
import type { CabinetEntry, CabinetView } from "@/lib/pra-wam/mom-cabinet";

export const dynamic = "force-dynamic";

const photo = (n: number) => ({ id: `0a000000-0000-4000-8000-00000000000${n}`, width: 1920, height: 1440, size: 640_000 + n * 40_000, at: "2026-11-10T07:00:00Z", onTv: n === 2 });
const entry = (patch: Partial<CabinetEntry>): CabinetEntry => ({
  sessionId: "5e550000-0000-4000-8000-000000000001", code: "MoM/2026/11/0012", title: "Appraisal team SS", date: "2026-11-10", from: "13.00", to: "14.00",
  place: "CFC Ananta Room", department: "Sales & Marketing", short: "SM", hod: false, chair: "Etik", notetaker: "Raja",
  present: 3, total: 4, guests: 1, topics: 2, decisions: 3, actions: 2, open: 1, version: 2, sentAt: "2026-11-10T07:00:00Z", telegramOff: false, photos: [photo(1), photo(2), photo(3)], ...patch,
});

/** Layout check for Admin WAM → Arsip MoM without signing in (?keadaan=baru: before migration 0006). The buttons call the real API, which refuses without an admin session. */
export default async function DevMomCabinetPage({ searchParams }: { searchParams: Promise<{ keadaan?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const fresh = (await searchParams).keadaan === "baru";
  const view: CabinetView = {
    migrated: true, tvReady: !fresh,
    entries: [
      entry({}),
      entry({ sessionId: "5e550000-0000-4000-8000-000000000002", code: "MoM/2026/11/0013", title: "Appraisal team SS", from: "15.00", to: "16.00", photos: [photo(4)] }),
      entry({ sessionId: "5e550000-0000-4000-8000-000000000003", code: "MoM/2026/11/0014", title: "Evaluasi Meeting", date: "2026-11-11", department: "Center of Excellence", short: "CoE", notetaker: "Sofyan", telegramOff: true, photos: [] }),
      entry({ sessionId: "5e550000-0000-4000-8000-000000000004", code: "MoM/2026/10/0003", title: "Meeting HOD Oktober", date: "2026-10-28", department: "Meeting HOD", short: "HOD", hod: true, photos: [photo(5)] }),
    ],
  };
  return <AdminShell bare><ConsoleTheme canvas><div style={{ padding: 24, maxWidth: 1100 }}><PraWamMomCabinet initial={view} crumbs={[{ label: "Admin WAM" }, { label: "Data peserta" }, { label: "Arsip MoM" }]} /></div></ConsoleTheme></AdminShell>;
}
