import { notFound } from "next/navigation";
import { wamAcaraCrumbs } from "@/components/admin/wam-acara/sections";
import { TripsEditor } from "@/components/admin/wam-acara/isi/TripsEditor";
import { sampleAdminPeople, sampleAdminSeats, sampleAdminSessions, sampleAdminSettings, sampleAdminTrips } from "@/lib/main-wam/admin/sample";
import { eventDates } from "@/lib/main-wam/rundown";
import { AdminPreviewFrame, previewFlags } from "../Frame";

export const dynamic = "force-dynamic";

/** Admin WAM 2027 → Perjalanan without signing in (404 in production): ?isi=kosong, ?migrasi=belum. */
export default async function DevAdminPerjalanan({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const params = await searchParams;
  const { waiting, empty } = previewFlags(params);
  const none = empty || waiting;
  return <AdminPreviewFrame current="perjalanan">
    <TripsEditor key={JSON.stringify(params)} initial={{ trips: none ? [] : sampleAdminTrips, seats: none ? [] : sampleAdminSeats }} migrated={!waiting} sessions={sampleAdminSessions()}
      people={sampleAdminPeople} dates={eventDates(sampleAdminSettings().event)}
      crumbs={wamAcaraCrumbs("perjalanan")} title="Perjalanan" />
  </AdminPreviewFrame>;
}
