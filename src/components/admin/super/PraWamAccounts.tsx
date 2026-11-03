"use client";

import { useState } from "react";
import { Button, Notice } from "@/components/ui";
import { adminRequest, errorMessage } from "@/components/admin/shared/api";
import { EMPLOYEES_ADMIN, praWamAccountsApi, praWamPath } from "@/lib/routes";
import type { AccountRow } from "@/lib/server/pra-wam/accounts";
import styles from "@/components/admin/admin.module.css";

/**
 * Accounts for Pra WAM: everyone active in Data karyawan with an email gets one, with the shared
 * first password. Emails are corrected in Data karyawan, then accounts are created here.
 */
export function PraWamAccounts({ initial, migrated, passwordReady }: { initial: AccountRow[]; migrated: boolean; passwordReady: boolean }) {
  const [rows, setRows] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string; skipped?: string[] } | null>(null);
  const active = rows.filter(row => row.active);
  const missing = active.filter(row => !row.hasAccount);
  const noEmail = missing.filter(row => !row.email);

  async function create() {
    setBusy(true); setMessage(null);
    try {
      const result = await adminRequest<{ created: number; skipped: string[]; rows: AccountRow[] }>(praWamAccountsApi, { method: "POST" });
      if (result.data) setRows(result.data.rows);
      setMessage({ tone: "success", text: result.message, skipped: result.data?.skipped });
    } catch (error) { setMessage({ tone: "error", text: errorMessage(error) }); }
    finally { setBusy(false); }
  }

  if (!migrated) return <Notice tone="warning">Akun Pra WAM menunggu migrasi 202611040001_pra_wam_appraisal.sql.</Notice>;
  return <div className="stack">
    <p>{active.length - missing.length} dari {active.length} karyawan aktif sudah punya akun. Mereka masuk di <a href={praWamPath.login()}>{praWamPath.login()}</a> dengan email kantor dan password awal yang sama, lalu bisa menggantinya nanti.</p>
    {!passwordReady && <Notice tone="warning">Password awal belum disiapkan. Isi WAM_DEFAULT_PASSWORD (minimal 8 karakter) pada server, lalu muat ulang halaman ini.</Notice>}
    {noEmail.length > 0 && <Notice tone="info">{noEmail.length} orang belum punya email. Lengkapi di <a href={EMPLOYEES_ADMIN}>Data karyawan</a> (impor ulang Excel dengan kolom EMAIL, atau ubah satu per satu).</Notice>}
    <div className={styles.qrActions}>
      <Button type="button" disabled={busy || !passwordReady || missing.length === noEmail.length} onClick={create}>{busy ? "Membuat akun…" : `Buat ${missing.length - noEmail.length} akun`}</Button>
    </div>
    {message && <Notice tone={message.tone}>{message.text}{message.skipped?.length ? <ul>{message.skipped.map(item => <li key={item}>{item}</li>)}</ul> : null}</Notice>}
    <table className={styles.table}>
      <thead><tr><th>Nama</th><th>Departemen</th><th>Email</th><th>Akun</th></tr></thead>
      <tbody>{rows.map(row => <tr key={row.employeeId}>
        <td>{row.name}{!row.active && " (nonaktif)"}</td><td>{row.department}</td><td>{row.email || "—"}</td>
        <td>{row.hasAccount ? (row.lastLoginAt ? "Sudah masuk" : "Siap") : "Belum ada"}</td>
      </tr>)}</tbody>
    </table>
  </div>;
}
