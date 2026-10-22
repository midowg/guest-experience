import type { Metadata } from "next";
import { AdminShell, SetupNotice } from "@/components/admin/shared/AdminShell";
import { CheckinConfirm } from "@/components/admin/checkin/CheckinConfirm";
import { ButtonLink, Notice } from "@/components/ui";
import { isTicketCode } from "@/lib/tickets";
import { getAdminEvent } from "@/lib/server/events";
import { listCheckins, ticketByCode } from "@/lib/server/tickets";
import { isSupabaseConfigured } from "@/lib/server/config";
import styles from "@/components/admin/admin.module.css";
import { requireAdminPage, requireEventPage } from "@/lib/server/admin-session";
import { adminEventPath } from "@/lib/routes";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Check-in tiket", robots: { index: false, follow: false }, referrer: "no-referrer" };

/** Where a guest's QR leads. Signed-in staff confirm the check-in here; others meet the login page first. */
export default async function TicketScanPage({ params }: { params: Promise<{ code: string }> }) {
  await requireAdminPage();
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  const { code } = await params;
  const ticket = isTicketCode(code) ? await ticketByCode(code) : null;
  if (!ticket) return <AdminShell><h1 className={styles.title}>Tiket tidak dikenal</h1><Notice tone="error">QR ini tidak cocok dengan tiket mana pun. Cari nama tamu di halaman check-in acara.</Notice><ButtonLink href="/admin" variant="secondary">Semua acara</ButtonLink></AdminShell>;
  await requireEventPage(ticket.event_id);
  const event = await getAdminEvent(ticket.event_id);
  const guest = (await listCheckins(ticket.event_id)).guests.find(item => item.rsvp_id === ticket.rsvp_id);
  return <AdminShell>
    <p className="eyebrow">Check-in tiket</p>
    <h1 className={styles.title}>{event?.title ?? "Acara"}</h1>
    {guest && event ? <CheckinConfirm eventId={event.id} code={code} guest={guest} timezone={event.timezone} /> : <Notice tone="error">Tamu ini tidak lagi terdaftar hadir.</Notice>}
    <p><a href={adminEventPath(ticket.event_id, "checkin")}>Buka papan check-in acara ini</a></p>
  </AdminShell>;
}
