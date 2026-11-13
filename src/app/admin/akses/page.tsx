import { notFound } from "next/navigation";
import { AdminShell, SetupNotice } from "@/components/admin/shared/AdminShell";
import { SuperAdminFrame } from "@/components/admin/super/SuperAdminFrame";
import { AccessLogTable } from "@/components/admin/super/AccessLogTable";
import { PageHeader } from "@/components/console";
import { Notice } from "@/components/ui";
import css from "@/components/admin/super/admin-table.module.css";
import { listAccessLog, type AccessFilter } from "@/lib/server/access-log";
import { requireAdminPage } from "@/lib/server/admin-session";
import { isSupabaseConfigured } from "@/lib/server/config";

export const dynamic = "force-dynamic";
export const metadata = { title: "Log akses admin" };

const filters: { key: AccessFilter; label: string }[] = [
  { key: "semua", label: "Semua" }, { key: "berhasil", label: "Berhasil" }, { key: "gagal", label: "Gagal" }, { key: "keluar", label: "Keluar" },
];

/** Super admin: every sign-in and sign-out, one row each (13 Nov 2026: a plain table, with the name). */
export default async function AccessLogPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  // The access log belongs with the super admin; for anyone else the page does not exist.
  if ((await requireAdminPage()) !== "super") notFound();
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  const params = await searchParams;
  const filter = filters.find(item => item.key === params.jenis)?.key ?? "semua";
  const { entries, missing } = await listAccessLog(filter);
  return <SuperAdminFrame current="akses">
    <PageHeader title="Log akses admin" subtitle="Siapa masuk dan keluar admin, kapan, dan dari mana. 200 catatan terakhir." />
    <nav className={css.filters} aria-label="Saring log">
      {filters.map(item => <a key={item.key} href={item.key === "semua" ? "/admin/akses" : `/admin/akses?jenis=${item.key}`} aria-current={filter === item.key ? "page" : undefined}>{item.label}</a>)}
    </nav>
    {missing ? <Notice tone="warning">Tabel log akses belum ada. Terapkan migrasi <code>202610200001_admin_access_log.sql</code>; sampai saat itu login tetap berjalan tetapi belum tercatat.</Notice>
      : entries.length === 0 ? <p className={css.muted}>Belum ada catatan untuk saringan ini.</p>
      : <AccessLogTable entries={entries} />}
    <p className={css.muted} style={{ marginTop: 12 }}>ID perangkat adalah kode acak yang tersimpan di browser; berganti bila cookie dihapus atau memakai browser lain. Pada gagal masuk, Siapa berisi yang diketik di kolom email atau nama panggilan.</p>
  </SuperAdminFrame>;
}
