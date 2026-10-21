import type { ReactNode } from "react";
import { ArrowLeft, ClipboardCheck, Crown, ExternalLink, Eye, LayoutGrid, Mail, MessageSquare, Pencil, ShieldCheck, UtensilsCrossed } from "lucide-react";
import { adminRole } from "@/lib/server/admin-session";
import { ButtonLink, Notice } from "@/components/ui";
import type { EventRecord } from "@/lib/types";
import { LogoutButton } from "./AuthControls";
import styles from "./admin.module.css";

/** `bare` drops the signed-in links, for the login and setup screens. */
export async function AdminShell({ children, bare = false }: { children: ReactNode; bare?: boolean }) {
  const role = bare ? null : await adminRole();
  return <div className={styles.shell}>
    <header className={styles.header}>
      <div className={`container ${styles.headerInner}`}>
        <a href="/admin" className={styles.brand}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/werkudara_icon.png" alt="" width={36} height={36} className={styles.logo} />
          <span><strong>Werkudara</strong><span className={styles.brandSub}>Admin pengalaman tamu</span></span>
        </a>
        {!bare && <nav className={styles.headerNav} aria-label="Admin">
          {role === "super" && <a href="/admin/super" className={`${styles.headerLink} ${styles.roleLink}`}><Crown size={16} aria-hidden="true" /> Dashboard super admin</a>}
          <a href="/admin" className={styles.headerLink}><LayoutGrid size={16} aria-hidden="true" /> Semua acara</a>
          <a href="/admin/akses" className={styles.headerLink}><ShieldCheck size={16} aria-hidden="true" /> Log akses</a>
          <LogoutButton />
        </nav>}
      </div>
    </header>
    <main id="main" className={`container ${styles.main}`}>{children}</main>
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
export function EventNavigation({ event, current }: { event: EventRecord; current: "edit" | "invitations" | "responses" | "beo" | "feedback" | "preview" }) {
  const base = `/admin/events/${event.id}`;
  const tab = (key: typeof current, href: string, label: string, Icon: typeof Pencil) =>
    <a href={href} className={styles.tab} aria-current={current === key ? "page" : undefined}><Icon size={16} aria-hidden="true" /> {label}</a>;
  return <nav className={styles.navigation} aria-label="Pengelolaan acara">
    <a href="/admin" className={`${styles.tab} ${styles.tabBack}`}><ArrowLeft size={16} aria-hidden="true" /> Semua acara</a>
    {tab("edit", base, "Edit acara", Pencil)}
    {tab("invitations", `${base}/invitations`, "Undangan tamu", Mail)}
    {tab("responses", `${base}/responses`, "RSVP", ClipboardCheck)}
    {tab("beo", `${base}/beo`, "BEO", UtensilsCrossed)}
    {tab("feedback", `${base}/feedback`, "Feedback", MessageSquare)}
    {tab("preview", `${base}/preview`, "Preview tersimpan", Eye)}
    {event.status === "published" && <a href={`/e/${event.slug}`} target="_blank" rel="noopener noreferrer" className={styles.tab}><ExternalLink size={16} aria-hidden="true" /> Buka undangan publik<span className="sr-only"> (tab baru)</span></a>}
  </nav>;
}
