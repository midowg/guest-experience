import Link from "next/link";
import type { ReactNode } from "react";
import { ClipboardCheck, Crown, ExternalLink, Images, LayoutGrid, Mail, MessageSquare, Pencil, ScanLine, UtensilsCrossed } from "lucide-react";
import { adminRole } from "@/lib/server/admin-session";
import { ButtonLink, Notice } from "@/components/ui";
import type { EventRecord } from "@/lib/types";
import { LogoutButton } from "@/components/admin/shared/AuthControls";
import styles from "@/components/admin/admin.module.css";
import nav from "./navigation.module.css";
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
/**
 * The event's pages as plain tabs, in three runs: edit, guests (list, RSVP, check-in), operations
 * (BEO, gallery, feedback). "Semua acara" is in the header and the live preview in the editor.
 */
export function EventNavigation({ event, current }: { event: EventRecord; current: AdminTab }) {
  const tab = (key: AdminTab, label: string, Icon: typeof Pencil) =>
    <a href={adminEventPath(event, key)} className={nav.tab} aria-current={current === key ? "page" : undefined}><Icon size={16} aria-hidden="true" /> {label}</a>;
  return <nav className={nav.bar} aria-label="Pengelolaan acara">
    {tab("edit", "Edit acara", Pencil)}
    <span className={nav.divider} aria-hidden="true" />
    {tab("invitations", "Daftar tamu", Mail)}{tab("responses", "RSVP", ClipboardCheck)}{tab("checkin", "Check-in", ScanLine)}
    <span className={nav.divider} aria-hidden="true" />
    {tab("beo", "BEO", UtensilsCrossed)}{tab("gallery", "Galeri", Images)}{tab("feedback", "Feedback", MessageSquare)}
    {event.status === "published" && <a href={eventPath(event)} target="_blank" rel="noopener noreferrer" className={`${nav.tab} ${nav.public}`}><ExternalLink size={16} aria-hidden="true" /> Buka undangan<span className="sr-only"> (tab baru)</span></a>}
  </nav>;
}
