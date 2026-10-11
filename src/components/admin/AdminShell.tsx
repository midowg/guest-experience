import type { ReactNode } from "react";
import { ButtonLink, Notice } from "@/components/ui";
import type { EventRecord } from "@/lib/types";
import styles from "./admin.module.css";

export function AdminShell({ children }: { children: ReactNode }) {
  return <div className={styles.shell}><main id="main" className={`container ${styles.main}`}>{children}</main></div>;
}
export function SetupNotice() {
  return <section className={styles.login}><p className="eyebrow">Pengaturan aplikasi</p><h1 className={styles.title}>Hubungkan Supabase terlebih dahulu</h1>
    <Notice>Koneksi aplikasi belum tersedia. Tidak ada acara atau jawaban yang ditampilkan sebagai data contoh.</Notice>
    <ol><li>Isi environment Supabase sesuai panduan <code>docs/setup.md</code>, lalu mulai ulang aplikasi.</li><li>Terapkan migrasi database terbaru sesuai panduan.</li></ol>
    <p>Panel ini tidak memakai login. Pada domain publik, halaman dan API pengelolaan dapat diakses siapa pun. Jangan menaruh service key atau token di kode browser.</p>
    <ButtonLink href="/admin" variant="secondary">Periksa koneksi</ButtonLink>
  </section>;
}
export function EventNavigation({ event, current }: { event: EventRecord; current: "edit" | "invitations" | "responses" | "feedback" | "preview" }) {
  const base = `/admin/events/${event.id}`;
  return <nav className={styles.navigation} aria-label="Pengelolaan acara">
    <a href="/admin">Semua acara</a>
    {current !== "edit" && <a href={base}>Edit acara</a>}
    <a href={`${base}/invitations`} aria-current={current === "invitations" ? "page" : undefined}>Undangan tamu</a>
    <a href={`${base}/responses`} aria-current={current === "responses" ? "page" : undefined}>RSVP</a>
    <a href={`${base}/feedback`} aria-current={current === "feedback" ? "page" : undefined}>Feedback</a>
    <a href={`${base}/preview`} aria-current={current === "preview" ? "page" : undefined}>Preview tersimpan</a>
    {event.status === "published" && <a href={`/e/${event.slug}`} target="_blank" rel="noopener noreferrer">Buka undangan publik</a>}
  </nav>;
}
