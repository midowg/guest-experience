"use client";

import { useState } from "react";
import { Button, Notice } from "@/components/ui";
import { useConfirm } from "@/components/pra-wam/ConfirmDialog";
import { adminRequest, errorMessage } from "@/components/admin/shared/api";
import { resetStatusLabels } from "@/lib/pra-wam/reset-requests";
import { praWamResetRequestsApi } from "@/lib/routes";
import type { ResetRequestList, ResetRequestRow } from "@/lib/server/pra-wam/reset-requests";
import styles from "@/components/admin/admin.module.css";

const when = (iso: string) => new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(new Date(iso));
const who = (row: ResetRequestRow) => row.name ?? "Email tidak terdaftar";

/** Why "Reset ke password awal" cannot be used for a request, or null when it can. */
function resetBlocked(row: ResetRequestRow, passwordReady: boolean): string | null {
  if (!row.employeeId) return "Email ini tidak ada di Data karyawan. Periksa ejaannya, atau tolak.";
  if (!row.hasAccount) return "Orang ini belum punya akun Pra WAM. Buat akunnya dulu di Akun dan peran.";
  if (!passwordReady) return "Password awal belum disiapkan di server.";
  return null;
}

/**
 * "Lupa password" requests from /wam/forgot-password: the super admin resets the account to the
 * shared first password (through the same reset as Akun dan peran) or declines.
 */
export function PraWamResetRequests({ initial, passwordReady }: { initial: ResetRequestList; passwordReady: boolean }) {
  const [list, setList] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [rowError, setRowError] = useState<{ id: string; text: string } | null>(null);
  const [confirm, confirmDialog] = useConfirm();

  const show = (fresh: ResetRequestList | undefined) => { if (fresh) setList(fresh); };
  async function refresh() {
    setBusy("refresh"); setMessage(null); setRowError(null);
    try { show((await adminRequest<ResetRequestList>(praWamResetRequestsApi())).data); }
    catch (error) { setMessage({ tone: "error", text: errorMessage(error) }); }
    finally { setBusy(null); }
  }
  async function answer(row: ResetRequestRow, action: "reset" | "tolak") {
    if (action === "reset" && !(await confirm({
      title: "Atur ulang password?",
      body: `Password ${who(row)} (${row.email}) kembali ke password awal. Ia keluar dari semua perangkat dan diminta membuat password baru saat masuk.`,
      confirmLabel: "Atur ulang",
      danger: true,
    }))) return;
    setBusy(`${action}-${row.id}`); setMessage(null); setRowError(null);
    try {
      const result = await adminRequest<ResetRequestList>(praWamResetRequestsApi(row.id), { method: "PATCH", body: JSON.stringify({ action }) });
      show(result.data);
      setMessage({ tone: "success", text: `${who(row)}: ${result.message}` });
    } catch (error) {
      setRowError({ id: row.id, text: errorMessage(error) });
      // The request may have been handled elsewhere meanwhile; show the list as it is now.
      try { show((await adminRequest<ResetRequestList>(praWamResetRequestsApi())).data); } catch { /* keep the list shown */ }
    } finally { setBusy(null); }
  }

  const count = list.open.length;
  return <section className="stack" aria-labelledby="permintaan-reset">
    {confirmDialog}
    <h2 id="permintaan-reset" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      Permintaan reset password
      {list.migrated && <span className={count ? styles.guestBadge : `${styles.guestBadge} ${styles.badgeMuted}`} aria-label={`${count} menunggu`}>{count}</span>}
    </h2>
    {!list.migrated ? <Notice tone="warning">Permintaan reset password menunggu migrasi 202611040010_pra_wam_photos_reset_requests.sql. Sampai itu diterapkan, orang yang lupa password diminta menghubungi admin langsung.</Notice> : <>
      <p>Dari halaman Lupa password. Reset mengembalikan password ke password awal; orangnya keluar dari semua perangkat lalu membuat password baru saat masuk. Isi email tidak pernah memberi tahu peminta apakah emailnya terdaftar.</p>
      <div><Button type="button" variant="secondary" disabled={!!busy} onClick={refresh}>{busy === "refresh" ? "Memuat…" : "Muat ulang"}</Button></div>
      {message && <Notice tone={message.tone}>{message.text}</Notice>}
      {count === 0 ? <p>Tidak ada permintaan yang menunggu.</p> : <div style={{ overflowX: "auto" }}>
        <table className={styles.table}>
          <caption className="sr-only">Permintaan reset yang menunggu, terbaru di atas</caption>
          <thead><tr><th>Nama</th><th>Email</th><th>Catatan</th><th>Masuk</th><th><span className="sr-only">Tindakan</span></th></tr></thead>
          <tbody>{list.open.map(row => {
            const blocked = resetBlocked(row, passwordReady);
            const hintId = `reset-${row.id}`;
            return <tr key={row.id}>
              <td>{row.name ?? <em>Email tidak terdaftar</em>}{row.department && <><br /><small>{row.department}</small></>}
                {blocked && <div id={hintId} className="field-hint">{blocked}</div>}
                {rowError?.id === row.id && <div role="alert" className="field-error">{rowError.text}</div>}
              </td>
              <td>{row.email}</td>
              <td style={{ maxWidth: "20rem", overflowWrap: "anywhere" }}>{row.note || "—"}</td>
              <td>{when(row.createdAt)}</td>
              <td><div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Button type="button" disabled={!!busy || !!blocked} aria-describedby={blocked ? hintId : undefined} onClick={() => answer(row, "reset")}>{busy === `reset-${row.id}` ? "Mengatur…" : "Reset ke password awal"}</Button>
                <Button type="button" variant="quiet" disabled={!!busy} onClick={() => answer(row, "tolak")}>{busy === `tolak-${row.id}` ? "Menolak…" : "Tolak"}</Button>
              </div></td>
            </tr>;
          })}</tbody>
        </table>
      </div>}
      {list.history.length > 0 && <details>
        <summary style={{ minHeight: 44, display: "flex", alignItems: "center", cursor: "pointer", fontWeight: 700 }}>Riwayat ({list.history.length} terakhir)</summary>
        <div style={{ overflowX: "auto" }}>
          <table className={styles.table}>
            <thead><tr><th>Nama</th><th>Email</th><th>Hasil</th><th>Ditangani</th></tr></thead>
            <tbody>{list.history.map(row => <tr key={row.id}>
              <td>{row.name ?? <em>Email tidak terdaftar</em>}</td>
              <td>{row.email}</td>
              <td>{resetStatusLabels[row.status]}</td>
              <td>{row.handledAt ? when(row.handledAt) : "—"}{row.handledBy ? ` · ${row.handledBy}` : ""}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </details>}
    </>}
  </section>;
}
