import Link from "next/link";
import type { ReactNode } from "react";
import { Crown, LayoutGrid } from "lucide-react";
import { adminRole } from "@/lib/server/admin-session";
import { ButtonLink, Notice } from "@/components/ui";
import type { EventRecord } from "@/lib/types";
import { LogoutButton } from "@/components/admin/shared/AuthControls";
import styles from "@/components/admin/admin.module.css";
import { EventPagesMenu } from "./EventPagesMenu";
import shell from "./shell.module.css";
import { adminEventPath, eventPath, type AdminTab } from "@/lib/routes";

/** `bare` drops the signed-in links, for the login and setup screens. */
/** `wide` gives pages with a side preview (the editor) more room than the usual reading width. */
export async function AdminShell({ children, bare = false, wide = false }: { children: ReactNode; bare?: boolean; wide?: boolean }) {
  const role = bare ? null : await adminRole();
  return <div className={styles.shell}>
    <header className={styles.header}>
      <div className={`container ${styles.headerInner} ${shell.inner}`}>
        <Link href="/admin" className={styles.brand}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/werkudara_icon.png" alt="" width={36} height={36} className={styles.logo} />
          <span><strong>Werkudara</strong><span className={styles.brandSub}>Admin pengalaman tamu</span></span>
        </Link>
        {!bare && <nav className={`${styles.headerNav} ${shell.nav}`} aria-label="Admin">
          {/* On a phone only the icons show; each link keeps its name for screen readers. */}
          {role === "super" && <Link href="/admin/super" aria-label="Dashboard super admin" className={`${styles.headerLink} ${styles.roleLink}`}><Crown size={16} aria-hidden="true" /> <span className={shell.linkText}>Super admin</span></Link>}
          <Link href="/admin" aria-label="Semua acara" className={styles.headerLink}><LayoutGrid size={16} aria-hidden="true" /> <span className={shell.linkText}>Semua acara</span></Link>
          <LogoutButton />
        </nav>}
      </div>
    </header>
    <main id="main" className={`container ${styles.main}`} style={wide ? { ["--container" as string]: "100rem" } : undefined}>{children}</main>
  </div>;
}
export function SetupNotice() {
  return <section className={styles.login}><p className="eyebrow">Pengaturan aplikasi</p><h1 className={styles.title}>Hubungkan Supabase terlebih dahulu</h1>
    <Notice>Koneksi aplikasi belum tersedia. Tidak ada acara atau jawaban yang ditampilkan sebagai data contoh.</Notice>
    <ol><li>Isi environment Supabase sesuai panduan <code>docs/setup.md</code>, lalu mulai ulang aplikasi.</li><li>Terapkan migrasi database terbaru sesuai panduan.</li></ol>
    <p>Jangan menaruh service key, password admin, atau token di kode browser.</p>
    <ButtonLink href="/admin" variant="secondary">Periksa koneksi</ButtonLink>
  </section>;
}
/** The event's pages behind one dropdown, grouped; "Semua acara" is in the header, the live preview in the editor. */
export function EventNavigation({ event, current }: { event: EventRecord; current: AdminTab }) {
  const page = (tab: AdminTab, label: string) => ({ tab, label, href: adminEventPath(event, tab) });
  const publicHref = event.status === "published" ? eventPath(event) : undefined;
  // A card has no guests, RSVP or operations: its editor is all there is.
  if (event.event_kind === "kartu") return <EventPagesMenu current={current} publicHref={publicHref} groups={[{ label: "Edit", pages: [page("edit", "Edit kartu")] }]} />;
  // An E-Guide is read, not attended: no guest list, RSVP, check-in, BEO, event photos or survey.
  if (event.event_kind === "eguide") return <EventPagesMenu current={current} publicHref={publicHref} publicLabel="Buka E-Guide" groups={[{ label: "Edit", pages: [page("edit", "Edit E-Guide")] }]} />;
  // A Panduan lokasi is read by anyone with the link: no guests, answers or operations.
  if (event.event_kind === "panduan") return <EventPagesMenu current={current} publicHref={publicHref} publicLabel="Buka panduan" groups={[{ label: "Edit", pages: [page("edit", "Edit panduan")] }]} />;
  // A CSR page takes donations, not guests: its editor and the donation desk.
  if (event.event_kind === "csr") return <EventPagesMenu current={current} publicHref={publicHref} publicLabel="Buka halaman donasi" groups={[{ label: "Edit", pages: [page("edit", "Edit halaman")] }, { label: "Donasi", pages: [page("donations", "Donasi masuk")] }]} />;
  // An office visit (board 12): its page, its guests and confirmations, then the team's own pages. No tickets, so no check-in.
  if (event.event_kind === "kunjungan") return <EventPagesMenu current={current} publicHref={publicHref} publicLabel="Buka halaman tamu" groups={[
    { label: "Edit", pages: [page("edit", "Isi halaman")] },
    { label: "Tamu", pages: [page("responses", "Tamu & konfirmasi"), ...(event.invitation_mode === "personal" ? [page("invitations", "Tautan pribadi")] : [])] },
    { label: "Operasional", pages: [page("beo", "BEO"), page("gallery", "Foto"), page("feedback", "Survei")] },
  ]} />;
  return <EventPagesMenu current={current} publicHref={publicHref} groups={[
    { label: "Edit", pages: [page("edit", "Edit acara")] },
    { label: "Tamu", pages: [page("invitations", "Daftar tamu"), page("responses", "RSVP"), page("checkin", "Check-in")] },
    { label: "Operasional", pages: [page("beo", "BEO"), page("gallery", "Galeri foto"), page("feedback", "Feedback")] },
  ]} />;
}
