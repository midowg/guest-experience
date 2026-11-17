import { notFound } from "next/navigation";
import { TripsEditor } from "@/components/admin/wam/main-wam/isi/TripsEditor";
import { sampleAdminPeople, sampleAdminSeats, sampleAdminSessions, sampleAdminSettings, sampleAdminTrips } from "@/lib/main-wam/admin/sample";
import { eventDates } from "@/lib/main-wam/rundown";
import { AdminPreviewFrame, previewFlags } from "../Frame";

export const dynamic = "force-dynamic";

/** Admin WAM → Main WAM → Perjalanan without signing in (404 in production): ?isi=kosong, ?migrasi=belum. */
export default async function DevAdminPerjalanan({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const params = await searchParams;
  const { waiting, empty } = previewFlags(params);
  const none = empty || waiting;
  return <AdminPreviewFrame current="mw-perjalanan">
    <TripsEditor key={JSON.stringify(params)} initial={{ trips: none ? [] : sampleAdminTrips, seats: none ? [] : sampleAdminSeats }} migrated={!waiting} sessions={sampleAdminSessions()}
      people={sampleAdminPeople} dates={eventDates(sampleAdminSettings().event)}
      crumbs={[{ label: "Admin WAM", href: "#" }, { label: "Main WAM" }, { label: "Isi acara", href: "#" }, { label: "Perjalanan" }]} title="Main WAM · Perjalanan" />
  </AdminPreviewFrame>;
}
