import { Notice } from "@/components/ui";
import { AdminShell, SetupNotice } from "@/components/admin/shared/AdminShell";
import { WamAdminFrame, waitingResetRequests } from "@/components/admin/wam/WamAdminFrame";
import { wamSection, wamSections, type WamSectionKey } from "@/components/admin/wam/sections";
import styles from "@/components/admin/wam/wam-admin.module.css";
import { dateRange } from "@/lib/pra-wam/about";
import { isSupabaseConfigured } from "@/lib/server/config";
import { requireAdminPage } from "@/lib/server/admin-session";
import { defaultPasswordReady, listAccounts } from "@/lib/server/pra-wam/accounts";
import { listRooms } from "@/lib/server/pra-wam/appraisal";
import { listEvents, type PraWamEvent } from "@/lib/server/pra-wam/events";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin WAM" };

const statusLabels: Record<PraWamEvent["status"], string> = { aktif: "Aktif", disiapkan: "Disiapkan", selesai: "Selesai" };
type Stat = { value: string; label: string; to: WamSectionKey; alert?: boolean };

/**
 * Admin WAM → Ringkasan, for any admin (HR checks WAM here): the key numbers, each opening its
 * section, the Pra WAM and WAM dates, and a card per section. The app itself opens from the menu.
 */
export default async function WamAdminPage() {
  await requireAdminPage();
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  const accounts = await listAccounts();
  const [events, waiting, rooms] = await Promise.all([
    listEvents(),
    waitingResetRequests(),
    accounts.migrated ? listRooms().catch(() => null) : null,
  ]);
  const active = accounts.rows.filter(row => row.active);
  const withAccount = active.filter(row => row.hasAccount);
  const noCapacity = rooms?.filter(room => room.capacity == null).length ?? null;
  const stats: Stat[] = accounts.migrated ? [
    { value: `${withAccount.length}/${active.length}`, label: "Karyawan aktif yang punya akun", to: "akun" },
    { value: String(withAccount.filter(row => row.lastLoginAt).length), label: "Sudah pernah masuk", to: "akun" },
    { value: String(withAccount.filter(row => row.mustChangePassword).length), label: "Masih memakai password awal", to: "akun" },
    ...(waiting == null ? [] : [{ value: String(waiting), label: "Permintaan reset menunggu", to: "reset" as const, alert: waiting > 0 }]),
    ...(noCapacity == null ? [] : [{ value: String(noCapacity), label: "Ruang tanpa kapasitas", to: "ruang" as const, alert: noCapacity > 0 }]),
  ] : [];

  return <WamAdminFrame current="ringkasan">
    {!defaultPasswordReady() && <Notice tone="warning">Password awal belum disiapkan. Isi WAM_DEFAULT_PASSWORD (minimal 8 karakter) pada server sebelum membuat akun atau mereset password.</Notice>}
    <section className={styles.section} aria-labelledby="wam-angka">
      <h2 id="wam-angka">Angka penting</h2>
      {!accounts.migrated ? <Notice tone="warning">Akun WAM menunggu migrasi 202611040001_pra_wam_appraisal.sql.</Notice>
        : <ul className={styles.stats}>{stats.map(stat => <li key={stat.label}>
          <a href={wamSection(stat.to).href} className={`${styles.stat} ${stat.alert ? styles.statAlert : ""}`}><strong>{stat.value}</strong><span>{stat.label}</span></a>
        </li>)}</ul>}
    </section>
    <section className={styles.section} aria-labelledby="wam-jadwal">
      <h2 id="wam-jadwal">Jadwal</h2>
      {!events.migrated ? <Notice tone="warning">Jadwal Pra WAM dan WAM menunggu migrasi 202611040003_pra_wam_events_units.sql.</Notice>
        : <ul className={styles.events}>{events.events.map(event => <li key={event.id}>
          <strong>{event.name}</strong><span>{dateRange(event.startDate, event.endDate)}</span>
          <span className={`${styles.pill} ${event.status === "aktif" ? styles.pillOn : ""}`}>{statusLabels[event.status]}</span>
        </li>)}</ul>}
      {events.migrated && <p><small>Status dan modul diubah di <a href={wamSection("acara").href}>{wamSection("acara").label}</a>.</small></p>}
    </section>
    <section className={styles.section} aria-labelledby="wam-bagian">
      <h2 id="wam-bagian">Bagian</h2>
      <ul className={styles.cards}>{wamSections.filter(section => section.key !== "ringkasan").map(section => {
        const Icon = section.icon;
        return <li key={section.key}><a href={section.href} className={styles.card}>
          <span className={styles.cardIcon}><Icon size={20} aria-hidden="true" /></span>
          <div><h3>{section.label}</h3><p>{section.summary}</p></div>
        </a></li>;
      })}</ul>
    </section>
  </WamAdminFrame>;
}
