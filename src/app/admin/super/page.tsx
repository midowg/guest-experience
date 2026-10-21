import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell, SetupNotice } from "@/components/admin/shared/AdminShell";
import { SuperDashboard, type SuperEventRow } from "@/components/admin/super/SuperDashboard";
import styles from "@/components/admin/admin.module.css";
import { isSupabaseConfigured } from "@/lib/server/config";
import { listAdminEvents } from "@/lib/server/events";
import { hiddenEventIds } from "@/lib/server/event-visibility";
import { requireAdminPage } from "@/lib/server/admin-session";
import { getDisabledModules, getEnabledTemplates } from "@/lib/server/admin-settings";
import { TemplateSettings } from "@/components/admin/super/TemplateSettings";
import { ModuleSettings } from "@/components/admin/super/ModuleSettings";
import { StaffSettings } from "@/components/admin/super/StaffSettings";
import { listStaff } from "@/lib/server/staff";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dashboard super admin" };

/** Super admin only. For anyone else the page does not exist. */
export default async function SuperAdminPage() {
  if ((await requireAdminPage()) !== "super") notFound();
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  const [events, hidden, modules, templates, team] = await Promise.all([listAdminEvents(), hiddenEventIds(), getDisabledModules(), getEnabledTemplates(), listStaff(false)]);
  // Only what the dashboard shows travels to the browser.
  const rows: SuperEventRow[] = events.map(event => ({
    id: event.id, title: event.title, slug: event.slug, status: event.status, starts_at: event.starts_at, timezone: event.timezone,
    event_kind: event.event_kind, audience: event.audience, updated_at: event.updated_at,
  }));
  return <AdminShell>
    <p className="eyebrow">Super admin</p>
    <h1 className={styles.title}>Dashboard super admin</h1>
    <p className={styles.lead}>Atur tim yang bisa dipilih sebagai PIC, templat yang bisa dipilih admin biasa, acara yang terlihat, dan modul yang boleh dipakai saat membuat atau mengubah acara.</p>
    <nav className={styles.superTabs} aria-label="Bagian dashboard"><a href="#tim">Tim Werkudara</a><Link href="/admin/akses">Log akses</Link><a href="#templat">Templat</a><a href="#visibilitas">Visibilitas acara</a><a href="#modul">Modul admin</a></nav>
    <div id="tim"><StaffSettings initial={team.staff} migrated={team.migrated} /></div>
    <div id="templat"><TemplateSettings initialEnabled={templates.templates} migrated={templates.migrated} /></div>
    <section id="visibilitas" aria-labelledby="visibility-title" className="stack">
      <h2 id="visibility-title" className={styles.superSectionTitle}>Visibilitas acara</h2>
      <p className={styles.lead}>Acara yang disembunyikan tidak muncul di panel admin biasa dan tidak bisa mereka buka, ubah, atau salin. Halaman tamu tidak berubah: acara yang sudah dipublikasikan tetap bisa dibuka lewat tautannya.</p>
      <SuperDashboard events={rows} initialHidden={[...hidden.ids]} migrated={hidden.migrated} />
    </section>
    <div id="modul"><ModuleSettings initialDisabled={modules.modules} migrated={modules.migrated} /></div>
  </AdminShell>;
}
