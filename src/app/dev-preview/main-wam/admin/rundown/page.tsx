import { notFound } from "next/navigation";
import { RundownEditor } from "@/components/admin/wam/main-wam/isi/RundownEditor";
import { sampleAdminGuides, sampleAdminLog, sampleAdminPeople, sampleAdminSessions, sampleAdminSettings } from "@/lib/main-wam/admin/sample";
import { sampleChecklistItems, samplePrepSession } from "@/lib/main-wam/ceklis/sample";
import { eventDates } from "@/lib/main-wam/rundown";
import { AdminPreviewFrame, previewFlags } from "../Frame";

export const dynamic = "force-dynamic";

/**
 * Admin WAM → Main WAM → Rundown without signing in (404 in production): ?hari=1–4, ?isi=kosong,
 * ?migrasi=belum. Saving calls the real API (refused without a session).
 */
export default async function DevAdminRundown({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const params = await searchParams;
  const { waiting, empty } = previewFlags(params);
  const dates = eventDates(sampleAdminSettings().event);
  const day = Math.min(Math.max(Number(params.hari) || 2, 1), dates.length);
  // ?ceklis=ya: the agenda "Persiapan berangkat" (3 days before the first day) with its checklist; ?hari=p opens on Persiapan.
  const withPrep = params.ceklis === "ya" || params.hari === "p";
  const none = { required: false, items: [] };
  const sessions = [
    ...sampleAdminSessions().map(session => ({ ...session, checklist: none })),
    ...(withPrep ? [{ ...samplePrepSession, version: "2026-11-25T03:20:00.123456+00:00", usage: { attendance: 0, photos: 0, silent: false, awards: 0, activityGroups: 0 }, checklist: { required: true, items: sampleChecklistItems } }] : []),
  ];
  return <AdminPreviewFrame current="mw-isi">
    <RundownEditor key={`${params.hari}-${params.isi}-${params.migrasi}`} initial={empty || waiting ? [] : sessions} migrated={!waiting} checklistReady={params.migrasi !== "ceklis"} initialDay={params.hari === "p" ? "p" : undefined} dates={dates} people={sampleAdminPeople}
      guides={sampleAdminGuides.map(guide => ({ id: guide.id, title: guide.title, kind: guide.kind }))} log={sampleAdminLog} today={dates[day - 1]}
      crumbs={[{ label: "Admin WAM", href: "#" }, { label: "Main WAM" }, { label: "Isi acara", href: "#" }, { label: "Rundown" }]} title="Main WAM · Rundown" />
  </AdminPreviewFrame>;
}
