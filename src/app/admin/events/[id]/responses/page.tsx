import { notFound } from "next/navigation";
import { getAdminEvent } from "@/lib/server/events";
import { listRsvps } from "@/lib/server/responses";
import { isSupabaseConfigured } from "@/lib/server/config";
import { AdminShell, EventNavigation, SetupNotice } from "@/components/admin/shared/AdminShell";
import { ResponsesView } from "@/components/admin/responses/ResponseViews";
import styles from "@/components/admin/admin.module.css";
import { requireAdminPage, requireEventPage } from "@/lib/server/admin-session";

export const dynamic = "force-dynamic";

export default async function ResponsesPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdminPage();
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  const { id } = await params;
  await requireEventPage(id);
  const event = await getAdminEvent(id);
  if (!event) notFound();
  const search = await searchParams;
  const single = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? "";
  const attendance = single(search.attendance) === "yes" || single(search.attendance) === "no" ? single(search.attendance) as "yes" | "no" : undefined;
  const q = single(search.q).trim().slice(0, 100);
  const responses = await listRsvps(id, { page: Number(single(search.page)) || 1, attendance, q: q || undefined });
  return <AdminShell>
    <p className="eyebrow">Konfirmasi kehadiran</p>
    <h1 className={styles.title}>{event.title}</h1>
    <EventNavigation event={event} current="responses" />
    <ResponsesView eventId={id} initial={responses} initialFilters={{ attendance: attendance ?? "", q }} />
  </AdminShell>;
}
