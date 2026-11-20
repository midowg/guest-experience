import { notFound } from "next/navigation";
import { wamAcaraCrumbs } from "@/components/admin/wam-acara/sections";
import { RundownEditor } from "@/components/admin/wam-acara/isi/RundownEditor";
import { sampleAdminGuides, sampleAdminLog, sampleAdminPeople, sampleAdminSessions, sampleAdminSettings } from "@/lib/main-wam/admin/sample";
import { eventDates } from "@/lib/main-wam/rundown";
import { AdminPreviewFrame, previewFlags } from "../Frame";

export const dynamic = "force-dynamic";

/**
 * Admin WAM 2027 → Rundown without signing in (404 in production): ?hari=1–4, ?isi=kosong,
 * ?migrasi=belum. Saving calls the real API (refused without a session).
 */
export default async function DevAdminRundown({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const params = await searchParams;
  const { waiting, empty } = previewFlags(params);
  const dates = eventDates(sampleAdminSettings().event);
  const day = Math.min(Math.max(Number(params.hari) || 2, 1), dates.length);
  return <AdminPreviewFrame current="isi">
    <RundownEditor key={`${params.hari}-${params.isi}-${params.migrasi}`} initial={empty || waiting ? [] : sampleAdminSessions()} migrated={!waiting} dates={dates} people={sampleAdminPeople}
      guides={sampleAdminGuides.map(guide => ({ id: guide.id, title: guide.title, kind: guide.kind }))} log={sampleAdminLog} today={dates[day - 1]}
      crumbs={wamAcaraCrumbs("isi", "Rundown")} title="Rundown" />
  </AdminPreviewFrame>;
}
