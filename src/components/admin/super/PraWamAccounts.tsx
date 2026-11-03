"use client";

import { useState } from "react";
import { Button, Notice } from "@/components/ui";
import { adminRequest, errorMessage } from "@/components/admin/shared/api";
import type { Room } from "@/lib/pra-wam/appraisal";
import { praWamRoles, roleLabels, type PraWamRole } from "@/lib/pra-wam/roles";
import { EMPLOYEES_ADMIN, praWamAccountsApi, praWamPath, praWamRoomsApi } from "@/lib/routes";
import type { AccountRow } from "@/lib/server/pra-wam/accounts";
import styles from "@/components/admin/admin.module.css";

type Message = { tone: "success" | "error"; text: string; skipped?: string[] } | null;

/** Capacity and bookable for one room, saved on its own. */
function RoomRow({ room, onSaved }: { room: Room; onSaved: (rooms: Room[], text: string) => void }) {
  const [capacity, setCapacity] = useState(room.capacity?.toString() ?? "");
  const [bookable, setBookable] = useState(room.bookable);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const changed = capacity !== (room.capacity?.toString() ?? "") || bookable !== room.bookable;
  async function save() {
    setBusy(true); setError(null);
    try {
      const result = await adminRequest<Room[]>(praWamRoomsApi(room.id), { method: "PATCH", body: JSON.stringify({ capacity: capacity.trim() ? Number(capacity) : null, bookable }) });
      if (result.data) onSaved(result.data, `${room.name}: ${result.message}`);
    } catch (problem) { setError(errorMessage(problem)); }
    finally { setBusy(false); }
  }
  return <tr>
    <td>{room.name}<br /><small>{room.kind === "utama" ? "Ruang utama" : "Area"}</small></td>
    <td><input className="input" style={{ maxWidth: "7rem" }} inputMode="numeric" aria-label={`Kapasitas ${room.name}`} placeholder="—" value={capacity} onChange={event => setCapacity(event.target.value.replace(/\D/g, "").slice(0, 3))} /></td>
    <td><label><input type="checkbox" checked={bookable} onChange={event => setBookable(event.target.checked)} /> Bisa dipesan</label></td>
    <td><Button type="button" variant="secondary" disabled={busy || !changed} onClick={save}>{busy ? "Menyimpan…" : "Simpan"}</Button>{error && <div role="alert">{error}</div>}</td>
  </tr>;
}

/**
 * Pra WAM, set up by the super admin: accounts for everyone active in Data karyawan with an email
 * (shared first password), roles on top of peserta, password resets, and the rooms.
 */
export function PraWamAccounts({ initial, initialRooms, migrated, passwordReady }: { initial: AccountRow[]; initialRooms: Room[]; migrated: boolean; passwordReady: boolean }) {
  const [rows, setRows] = useState(initial);
  const [rooms, setRooms] = useState(initialRooms);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<Message>(null);
  const [filter, setFilter] = useState("");
  const active = rows.filter(row => row.active);
  const missing = active.filter(row => !row.hasAccount);
  const noEmail = missing.filter(row => !row.email);
  const query = filter.trim().toLowerCase();
  const shown = rows.filter(row => !query || `${row.name} ${row.department} ${row.email}`.toLowerCase().includes(query));

  async function run(key: string, url: string, body: unknown, method: "POST" | "PATCH") {
    setBusy(key); setMessage(null);
    try {
      const result = await adminRequest<{ rows: AccountRow[]; skipped?: string[] }>(url, { method, ...(body ? { body: JSON.stringify(body) } : {}) });
      if (result.data) setRows(result.data.rows);
      setMessage({ tone: "success", text: result.message, skipped: result.data?.skipped });
    } catch (error) { setMessage({ tone: "error", text: errorMessage(error) }); }
    finally { setBusy(null); }
  }
  const toggleRole = (row: AccountRow, role: PraWamRole) =>
    run(`role-${row.employeeId}`, praWamAccountsApi(row.employeeId), { roles: row.roles.includes(role) ? row.roles.filter(item => item !== role) : [...row.roles, role] }, "PATCH");
  const reset = (row: AccountRow) => {
    if (window.confirm(`Atur ulang password ${row.name} ke password awal? Ia keluar dari semua perangkat dan diminta membuat password baru saat masuk.`)) {
      void run(`reset-${row.employeeId}`, praWamAccountsApi(row.employeeId), { resetPassword: true }, "PATCH");
    }
  };

  if (!migrated) return <Notice tone="warning">Akun Pra WAM menunggu migrasi 202611040001_pra_wam_appraisal.sql.</Notice>;
  return <div className="stack">
    <p>{active.length - missing.length} dari {active.length} karyawan aktif sudah punya akun. Mereka masuk di <a href={praWamPath.login()}>{praWamPath.login()}</a> dengan email kantor dan password awal yang sama, lalu bisa menggantinya di menu Akun.</p>
    {!passwordReady && <Notice tone="warning">Password awal belum disiapkan. Isi WAM_DEFAULT_PASSWORD (minimal 8 karakter) pada server, lalu muat ulang halaman ini.</Notice>}
    {noEmail.length > 0 && <Notice tone="info">{noEmail.length} orang belum punya email. Lengkapi di <a href={EMPLOYEES_ADMIN}>Data karyawan</a> (impor ulang Excel dengan kolom EMAIL, atau ubah satu per satu).</Notice>}
    <div className={styles.qrActions}>
      <Button type="button" disabled={!!busy || !passwordReady || missing.length === noEmail.length} onClick={() => run("create", praWamAccountsApi(), null, "POST")}>{busy === "create" ? "Membuat akun…" : `Buat ${missing.length - noEmail.length} akun`}</Button>
    </div>
    {message && <Notice tone={message.tone}>{message.text}{message.skipped?.length ? <ul>{message.skipped.map(item => <li key={item}>{item}</li>)}</ul> : null}</Notice>}

    <h2>Akun dan peran</h2>
    <p>Semua orang yang punya akun adalah peserta. Centang untuk menambah peran: <strong>Panitia</strong> bisa membatalkan booking siapa pun, <strong>BOD</strong> melihat semua tanpa mengubah, <strong>Admin Pra WAM</strong> mengatur aplikasi.</p>
    <input className="input" type="search" aria-label="Cari nama, departemen, atau email" placeholder="Cari nama, departemen, atau email" value={filter} onChange={event => setFilter(event.target.value)} />
    <div style={{ overflowX: "auto" }}>
      <table className={styles.table}>
        <thead><tr><th>Nama</th><th>Email</th><th>Akun</th>{praWamRoles.map(role => <th key={role}>{roleLabels[role]}</th>)}<th /></tr></thead>
        <tbody>{shown.map(row => <tr key={row.employeeId}>
          <td>{row.name}{!row.active && " (nonaktif)"}<br /><small>{row.department}</small></td>
          <td>{row.email || "—"}</td>
          <td>{!row.hasAccount ? "Belum ada" : row.lastLoginAt ? (row.mustChangePassword ? "Masuk, password awal" : "Masuk") : "Siap"}</td>
          {praWamRoles.map(role => <td key={role}><input type="checkbox" aria-label={`${roleLabels[role]}: ${row.name}`} checked={row.roles.includes(role)} disabled={!!busy} onChange={() => toggleRole(row, role)} /></td>)}
          <td>{row.hasAccount && <Button type="button" variant="quiet" disabled={!!busy || !passwordReady} onClick={() => reset(row)}>{busy === `reset-${row.employeeId}` ? "Mengatur…" : "Reset password"}</Button>}</td>
        </tr>)}</tbody>
      </table>
    </div>

    <h2>Ruang appraisal</h2>
    <p>Kapasitas tampil di form pesan ruang. Hanya ruang yang dicentang &ldquo;Bisa dipesan&rdquo; yang muncul di form.</p>
    <table className={styles.table}>
      <thead><tr><th>Ruang</th><th>Kapasitas</th><th>Appraisal</th><th /></tr></thead>
      <tbody>{rooms.map(room => <RoomRow key={`${room.id}-${room.capacity}-${room.bookable}`} room={room} onSaved={(next, text) => { setRooms(next); setMessage({ tone: "success", text }); }} />)}</tbody>
    </table>
  </div>;
}
