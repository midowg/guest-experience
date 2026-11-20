import { notFound } from "next/navigation";
import { PageHeader, PageTabs } from "@/components/console";
import { SilentAdmin } from "@/components/admin/wam-acara/modul/SilentAdmin";
import { mainWamModuleTabs } from "@/components/admin/wam-acara/tabs";
import { sampleSessions, sampleSilentQuestion } from "@/lib/main-wam/sample";
import type { AdminSilent } from "@/lib/server/main-wam/modul/admin";
import { AdminPreviewFrame } from "../Frame";

export const dynamic = "force-dynamic";

/** Closed with 47 feedbacks (count shown), or open (`buka`: its state only, audit H2). */
function silent(open: boolean): AdminSilent {
  return {
    migrated: true, questions: [{ ...sampleSilentQuestion, state: open ? "buka" : "tutup", count: open ? null : 47, locked: true }],
    sessions: sampleSessions.map(({ id, title, startsAt, endsAt, status, module }) => ({ id, title, startsAt, endsAt, status, module })),
  };
}

/** Admin WAM 2026 → Silent Meeting in the real console frame, sample data, no sign-in, 404 in production: ?saat=buka. */
export default async function DevAdminSilent({ searchParams }: { searchParams: Promise<{ saat?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const open = (await searchParams).saat === "buka";
  return <AdminPreviewFrame current="silent">
    <PageHeader title="Silent Meeting" subtitle="Pertanyaan per sesi dan topiknya. Masukan tidak pernah tampil di sini." />
    <PageTabs tabs={mainWamModuleTabs} current="silent-meeting" label="Modul acara" />
    <SilentAdmin initial={silent(open)} />
  </AdminPreviewFrame>;
}
