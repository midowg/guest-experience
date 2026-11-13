import { Pill, type ConsoleTone } from "@/components/console";
import { formatDateTime } from "@/lib/format";
import { describeUserAgent } from "@/lib/user-agent";
import type { AccessEntry, AccessKind } from "@/lib/server/access-log";
import css from "./admin-table.module.css";

const kinds: Record<AccessKind, { label: string; tone: ConsoleTone }> = {
  login_success: { label: "Masuk", tone: "ok" },
  login_failure: { label: "Gagal masuk", tone: "bad" },
  logout: { label: "Keluar", tone: "neutral" },
};

/** "13 Nov 2026, 16.15" (WIB): short, so the other columns keep their room. */
const shortTime = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });
const place = (entry: AccessEntry) => [entry.city, entry.region, entry.country].filter(Boolean).join(", ") || "—";
/** Who, in words: the person's name (13 Nov 2026), else the role of the shared password, as older rows have it. */
function who(entry: AccessEntry) {
  if (entry.actor) return entry.actor;
  if (entry.role === "super") return "Super admin";
  if (entry.role === "admin") return "Admin (password bersama)";
  return "—";
}

/** Log akses as a plain table (13 Nov 2026): one row per sign-in or sign-out; a card per row on a phone. */
export function AccessLogTable({ entries }: { entries: AccessEntry[] }) {
  return <div className={css.wrap}>
    <table className={css.table}>
      <thead><tr><th>Waktu</th><th>Siapa</th><th>Kejadian</th><th>Perangkat</th><th>Lokasi</th><th>IP</th></tr></thead>
      <tbody>{entries.map(entry => {
        const kind = kinds[entry.kind];
        return <tr key={entry.id}>
          <td data-label="Waktu" className={css.nowrap}><time dateTime={entry.at} title={formatDateTime(entry.at)}>{shortTime.format(new Date(entry.at))}</time></td>
          <td data-label="Siapa"><span className={entry.employee_id ? css.strong : undefined}>{who(entry)}</span></td>
          <td data-label="Kejadian"><Pill tone={kind.tone}>{kind.label}</Pill></td>
          <td data-label="Perangkat"><div>{describeUserAgent(entry.user_agent)}{entry.new_device && <> <Pill tone="warn">Baru</Pill></>}
            {entry.device_id && <div className={css.code} title={`ID perangkat ${entry.device_id}`}>{entry.device_id.slice(0, 8)}</div>}</div></td>
          <td data-label="Lokasi">{place(entry)}</td>
          <td data-label="IP" className={css.code}>{entry.ip ?? "—"}</td>
        </tr>;
      })}</tbody>
    </table>
  </div>;
}
