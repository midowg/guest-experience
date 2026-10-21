import { notFound } from "next/navigation";
import { getAdminEvent } from "@/lib/server/events";
import { listFeedback } from "@/lib/server/responses";
import { isSupabaseConfigured } from "@/lib/server/config";
import { AdminShell, EventNavigation, SetupNotice } from "@/components/admin/shared/AdminShell";
import { FeedbackView } from "@/components/admin/responses/ResponseViews";
import styles from "@/components/admin/admin.module.css";
import { requireAdminPage, requireEventPage } from "@/lib/server/admin-session";

export const dynamic = "force-dynamic";

export default async function FeedbackPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdminPage();
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  const { id } = await params;
  await requireEventPage(id);
  const event = await getAdminEvent(id);
  if (!event) notFound();
  const page = await searchParams;
  const raw = Array.isArray(page.page) ? page.page[0] : page.page;
  const feedback = await listFeedback(id, Number(raw) || 1);
  return <AdminShell>
    <p className="eyebrow">Masukan tamu</p>
    <h1 className={styles.title}>{event.title}</h1>
    <EventNavigation event={event} current="feedback" />
    <FeedbackView eventId={id} initial={feedback} />
  </AdminShell>;
}
