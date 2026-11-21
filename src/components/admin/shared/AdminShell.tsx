import Link from "next/link";
import { headers } from "next/headers";
import { ADMIN_PATH_HEADER } from "@/lib/admin-access";
import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { ButtonLink, Notice } from "@/components/ui";
import type { EventRecord } from "@/lib/types";
import styles from "@/components/admin/admin.module.css";
import { EventHeader } from "./EventHeader";
import shell from "./shell.module.css";
import { adminEventPath, eventPath, type AdminTab } from "@/lib/routes";
import { listRsvps } from "@/lib/server/responses";
import { getBeo } from "@/lib/server/beo";
import { beoStatusLabels } from "@/lib/beo";

/** Kunjungan Kantor's tabs carry their numbers (board 12): confirmed guests and the BEO's status. Missing data leaves a tab plain. */
async function visitBadges(eventId: string): Promise<{ guests?: string; beo?: string }> {
  const [guests, beo] = await Promise.allSettled([listRsvps(eventId, { page: 1, attendance: "yes" }), getBeo(eventId)]);
  return {
    guests: guests.status === "fulfilled" && guests.value.total > 0 ? String(guests.value.total) : undefined,
    beo: beo.status === "fulfilled" && beo.value.migrated ? beoStatusLabels[beo.value.state.status] : undefined,
  };
}

/**
 * The admin's page frame. Since 22 Nov 2026 there is no top bar (it took room and added buttons):
 * Beranda carries the account button (AccountMenu), an event's pages their own "← Beranda" (EventHeader),
 * and every other admin page a small "← Beranda" here. `bare` (login, setup) keeps the Werkudara mark.
 * `wide` gives pages with a side preview (the editor) more room than the usual reading width.
 */
export async function AdminShell({ children, bare = false, wide = false }: { children: ReactNode; bare?: boolean; wide?: boolean }) {
  let path: string | null = null;
  try { path = (await headers()).get(ADMIN_PATH_HEADER); } catch { /* outside a request: show the way back */ }
  const clean = path?.split(/[?#]/)[0] ?? "";
  const onHome = /^\/admin\/?$/.test(clean);
  const onEvent = /^\/admin\/acara\//.test(clean);
  return <div className={styles.shell}>
    {bare && <header className={styles.header}>
      <div className={`container ${styles.headerInner} ${shell.inner}`}>
        <Link href="/admin" className={styles.brand}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/werkudara_icon.png" alt="" width={36} height={36} className={styles.logo} />
          <span><strong>Werkudara</strong><span className={styles.brandSub}>Admin pengalaman tamu</span></span>
        </Link>
      </div>
    </header>}
    {!bare && !!path && !onHome && !onEvent && <div className={`container ${shell.backRow}`}><Link href="/admin" className={shell.back}><ArrowLeft size={16} aria-hidden="true" /> Beranda</Link></div>}
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
 * The head of an event's pages (21 Nov 2026): photo, title, where it stands, the guest page, and the
 * event's pages as tabs (grouped as edit, guests and operations, in that order).
 */
export async function EventNavigation({ event, current }: { event: EventRecord; current: AdminTab }) {
  const page = (tab: AdminTab, label: string, badge?: string) => ({ tab, label, href: adminEventPath(event, tab), badge });
  const publicHref = event.status === "published" ? eventPath(event) : undefined;
  const head = (publicLabel: string, tabs: ReturnType<typeof page>[]) => <EventHeader event={event} current={current} publicHref={publicHref} publicLabel={publicLabel} tabs={tabs} />;
  // A card has no guests, RSVP or operations: its editor is all there is.
  if (event.event_kind === "kartu") return head("Buka kartu", [page("edit", "Edit kartu")]);
  // An E-Guide is read, not attended: no guest list, RSVP, check-in, BEO, event photos or survey.
  if (event.event_kind === "eguide") return head("Buka E-Guide", [page("edit", "Edit E-Guide")]);
  // A Panduan lokasi is read by anyone with the link: no guests, answers or operations.
  if (event.event_kind === "panduan") return head("Buka panduan", [page("edit", "Edit panduan")]);
  // A CSR page takes donations, not guests: its editor and the donation desk.
  if (event.event_kind === "csr") return head("Buka halaman donasi", [page("edit", "Edit halaman"), page("donations", "Donasi masuk"), page("donations-split", "Pembagian")]);
  // An office visit (board 12): with the confirmed guests and the BEO's status. No tickets, so no check-in.
  if (event.event_kind === "kunjungan") {
    const badges = await visitBadges(event.id);
    return head("Buka halaman tamu", [page("edit", "Isi halaman"), page("responses", "Tamu & konfirmasi", badges.guests),
      ...(event.invitation_mode === "personal" ? [page("invitations", "Tautan pribadi")] : []), page("beo", "BEO", badges.beo), page("gallery", "Foto"), page("feedback", "Survei")]);
  }
  return head("Buka undangan", [page("edit", "Edit acara"), page("invitations", "Daftar tamu"), page("responses", "RSVP"), page("checkin", "Check-in"),
    page("beo", "BEO"), page("gallery", "Galeri foto"), page("feedback", "Feedback")]);
}
