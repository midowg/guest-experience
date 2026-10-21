import { CircleAlert, CircleCheck, LogOut, MapPin, MonitorSmartphone, Sparkles } from "lucide-react";
import { AdminShell, SetupNotice } from "@/components/admin/shared/AdminShell";
import { Notice } from "@/components/ui";
import styles from "@/components/admin/admin.module.css";
import { formatDateTime } from "@/lib/format";
import { describeUserAgent } from "@/lib/user-agent";
import { listAccessLog, type AccessEntry, type AccessFilter } from "@/lib/server/access-log";
import { requireAdminPage } from "@/lib/server/admin-session";
import { isSupabaseConfigured } from "@/lib/server/config";

export const dynamic = "force-dynamic";
export const metadata = { title: "Log akses admin" };

const filters: { key: AccessFilter; label: string }[] = [
  { key: "semua", label: "Semua" }, { key: "berhasil", label: "Berhasil" }, { key: "gagal", label: "Gagal" }, { key: "keluar", label: "Keluar" },
];
const kinds = {
  login_success: { label: "Login berhasil", Icon: CircleCheck, tone: styles.access_success },
  login_failure: { label: "Password salah", Icon: CircleAlert, tone: styles.access_failure },
  logout: { label: "Keluar", Icon: LogOut, tone: styles.access_logout },
} as const;

function place(entry: AccessEntry) {
  const parts = [entry.city, entry.region, entry.country].filter(Boolean);
  return parts.length ? parts.join(", ") : "Lokasi tidak tersedia";
}

export default async function AccessLogPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdminPage();
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  const params = await searchParams;
  const filter = filters.find(item => item.key === params.jenis)?.key ?? "semua";
  const { entries, missing } = await listAccessLog(filter);
  return <AdminShell>
    <p className="eyebrow">Keamanan</p>
    <h1 className={styles.title}>Log akses admin</h1>
    <p className={styles.lead}>Setiap percobaan masuk dan keluar tercatat di sini. Password dipakai bersama, jadi log menunjukkan perangkat dan lokasi, bukan nama orangnya. ID perangkat adalah kode acak yang tersimpan di browser; berganti bila cookie dihapus atau memakai browser lain.</p>
    <nav className={styles.filterChips} aria-label="Saring log">
      {filters.map(item => <a key={item.key} href={item.key === "semua" ? "/admin/akses" : `/admin/akses?jenis=${item.key}`} aria-current={filter === item.key ? "page" : undefined}>{item.label}</a>)}
    </nav>
    {missing ? <Notice tone="warning">Tabel log akses belum ada. Terapkan migrasi <code>202610200001_admin_access_log.sql</code>; sampai saat itu login tetap berjalan tetapi belum tercatat.</Notice>
      : entries.length === 0 ? <p className="muted">Belum ada catatan untuk saringan ini.</p>
      : <ul className={styles.accessList}>
        {entries.map(entry => {
          const kind = kinds[entry.kind];
          return <li key={entry.id} className={styles.accessItem}>
            <span className={`${styles.accessIcon} ${kind.tone}`}><kind.Icon size={18} aria-hidden="true" /></span>
            <div className={styles.accessText}>
              <p className={styles.accessHead}><strong>{kind.label}</strong>{entry.role === "super" && <span className={styles.roleBadge}>Super admin</span>}{entry.new_device && <span className={styles.accessNew}><Sparkles size={13} aria-hidden="true" /> Perangkat baru</span>}</p>
              <p className={styles.accessMeta}><time dateTime={entry.at}>{formatDateTime(entry.at)}</time> · IP {entry.ip ?? "tidak tersedia"}</p>
              <p className={styles.accessMeta}><MapPin size={13} aria-hidden="true" /> {place(entry)}</p>
              <p className={styles.accessMeta}><MonitorSmartphone size={13} aria-hidden="true" /> {describeUserAgent(entry.user_agent)}{entry.device_id && <> · ID perangkat <code title={entry.device_id}>{entry.device_id.slice(0, 8)}</code></>}</p>
            </div>
          </li>;
        })}
      </ul>}
  </AdminShell>;
}
