import { notFound } from "next/navigation";
import { getAdminEvent, resolveEventRef } from "@/lib/server/events";
import { listRsvps } from "@/lib/server/responses";
import { isSupabaseConfigured } from "@/lib/server/config";
import { AdminShell, EventNavigation, SetupNotice } from "@/components/admin/shared/AdminShell";
import { ResponsesView } from "@/components/admin/responses/ResponseViews";
import { requireAdminPage, requireEventPage } from "@/lib/server/admin-session";

export const dynamic = "force-dynamic";

export default async function ResponsesPage({ params, searchParams }: { params: Promise<{ ref: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdminPage();
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  const id = await resolveEventRef((await params).ref);
  if (!id) notFound();
  await requireEventPage(id);
  const event = await getAdminEvent(id);
  if (!event) notFound();
  const search = await searchParams;
  const single = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? "";
  const attendance = single(search.attendance) === "yes" || single(search.attendance) === "no" ? single(search.attendance) as "yes" | "no" : undefined;
  const q = single(search.q).trim().slice(0, 100);
  const responses = await listRsvps(id, { page: Number(single(search.page)) || 1, attendance, q: q || undefined });
  return <AdminShell>
    <EventNavigation event={event} current="responses" />
    <ResponsesView eventId={id} initial={responses} initialFilters={{ attendance: attendance ?? "", q }} />
  </AdminShell>;
}
