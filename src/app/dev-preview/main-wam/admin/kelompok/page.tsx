import { notFound } from "next/navigation";
import { ActivityGroupsEditor } from "@/components/admin/wam/main-wam/isi/ActivityGroupsEditor";
import { GroupsEditor } from "@/components/admin/wam/main-wam/isi/GroupsEditor";
import { sampleAdminActivityGroups, sampleAdminGroups, sampleAdminPeople, sampleAdminSessions, sampleAdminSettings } from "@/lib/main-wam/admin/sample";
import { eventDates } from "@/lib/main-wam/rundown";
import { AdminPreviewFrame, previewFlags } from "../Frame";

export const dynamic = "force-dynamic";

const crumbs = [{ label: "Admin WAM", href: "#" }, { label: "Main WAM" }, { label: "Isi acara", href: "#" }, { label: "Kelompok" }];

/** Admin WAM → Main WAM → Kelompok without signing in (404 in production): ?tab=kegiatan, ?isi=kosong, ?migrasi=belum, ?terbit=1. */
export default async function DevAdminKelompok({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const params = await searchParams;
  const { waiting, empty } = previewFlags(params);
  const key = JSON.stringify(params);
  if (params.tab === "kegiatan") return <AdminPreviewFrame current="mw-kelompok">
    <ActivityGroupsEditor key={key} initial={empty || waiting ? [] : sampleAdminActivityGroups} migrated={!waiting} sessions={sampleAdminSessions()} people={sampleAdminPeople}
      dates={eventDates(sampleAdminSettings().event)} firstSession={params.sesi ?? null} crumbs={[...crumbs, { label: "Kelompok kegiatan" }]} title="Main WAM · Kelompok" />
  </AdminPreviewFrame>;
  return <AdminPreviewFrame current="mw-kelompok">
    <GroupsEditor key={key} initial={empty || waiting ? [] : sampleAdminGroups} migrated={!waiting} people={sampleAdminPeople} published={params.terbit === "1"} crumbs={crumbs} title="Main WAM · Kelompok" />
  </AdminPreviewFrame>;
}
