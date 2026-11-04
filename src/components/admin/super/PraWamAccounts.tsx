"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { Button, Notice } from "@/components/ui";
import { useConfirm } from "@/components/pra-wam/ConfirmDialog";
import { adminRequest, errorMessage } from "@/components/admin/shared/api";
import type { Room } from "@/lib/pra-wam/appraisal";
import { blockedRoles, praWamRoles, roleConflicts, roleLabels, roleProblem, type PraWamRole } from "@/lib/pra-wam/roles";
import { EMPLOYEES_ADMIN, praWamAccountsApi, praWamPath, praWamRoomsApi } from "@/lib/routes";
import type { AccountRow } from "@/lib/server/pra-wam/accounts";
import styles from "@/components/admin/admin.module.css";

type Message = { tone: "success" | "error"; text: string; skipped?: string[] } | null;

/** What each role does and which go together; the rule itself lives in lib/pra-wam/roles. */
const roleGuide: { role: string; does: string; combines: string }[] = [
  { role: "Peserta", does: "Book ruang, agenda dan dokumen sesi sendiri, absen QR.", combines: "Dasar setiap akun" },
  { role: "Panitia", does: "Kelola acara: sesi, permintaan jadwal, pengumuman; batalkan booking siapa pun.", combines: "Admin WAM, HOD" },
  { role: "Admin WAM", does: "Seperti Panitia, ditambah pengaturan aplikasi.", combines: "Panitia, HOD" },
  { role: "HOD", does: "Lead departemen, dari impor unit (tidak dicentang di sini). Aplikasi biasa; unitnya tampil lebih dulu saat memilih partisipan.", combines: "Panitia, Admin WAM" },
  { role: "BOD", does: "Menu BOD: Ringkasan, Peserta, Survei; melihat semua sesi tanpa mengubah. Tetap bisa ikut sesi dan book ruang.", combines: "Tidak dengan peran lain" },
];

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
  const [rowError, setRowError] = useState<{ id: string; text: string } | null>(null);
  const [filter, setFilter] = useState("");
  const [editing, setEditing] = useState<{ id: string; email: string } | null>(null);
  const [confirm, confirmDialog] = useConfirm();
  const active = rows.filter(row => row.active);
  const missing = active.filter(row => !row.hasAccount);
  const noEmail = missing.filter(row => !row.email);
  const query = filter.trim().toLowerCase();
  // A to Z by name, so a person is easy to find by scrolling.
  const shown = [...rows].sort((a, b) => a.name.localeCompare(b.name, "id", { sensitivity: "base" })).filter(row => !query || `${row.name} ${row.department} ${row.email}`.toLowerCase().includes(query));

  /** `rowId`: a change to one person, whose error shows on their row rather than at the top. */
  async function run(key: string, url: string, body: unknown, method: "POST" | "PATCH", rowId?: string): Promise<boolean> {
    setBusy(key); setMessage(null); setRowError(null);
    try {
      const result = await adminRequest<{ rows: AccountRow[]; skipped?: string[] }>(url, { method, ...(body ? { body: JSON.stringify(body) } : {}) });
      if (result.data) setRows(result.data.rows);
      setMessage({ tone: "success", text: result.message, skipped: result.data?.skipped });
      return true;
    } catch (error) {
      if (rowId) setRowError({ id: rowId, text: errorMessage(error) });
      else setMessage({ tone: "error", text: errorMessage(error) });
      return false;
    }
    finally { setBusy(null); }
  }
  const toggleRole = (row: AccountRow, role: PraWamRole) =>
    run(`role-${row.employeeId}`, praWamAccountsApi(row.employeeId), { roles: row.roles.includes(role) ? row.roles.filter(item => item !== role) : [...row.roles, role] }, "PATCH", row.employeeId);
  const reset = async (row: AccountRow) => {
    if (!(await confirm({
      title: "Atur ulang password?",
      body: `Password ${row.name} kembali ke password awal. Ia keluar dari semua perangkat dan diminta membuat password baru saat masuk.`,
      confirmLabel: "Atur ulang",
      danger: true,
    }))) return;
    void run(`reset-${row.employeeId}`, praWamAccountsApi(row.employeeId), { resetPassword: true }, "PATCH", row.employeeId);
  };

  if (!migrated) return <Notice tone="warning">Akun Pra WAM menunggu migrasi 202611040001_pra_wam_appraisal.sql.</Notice>;
  return <div className="stack">
    {confirmDialog}
    <p>{active.length - missing.length} dari {active.length} karyawan aktif sudah punya akun. Mereka masuk di <a href={praWamPath.login()}>{praWamPath.login()}</a> dengan email kantor dan password awal yang sama, lalu bisa menggantinya di menu Akun.</p>
    {!passwordReady && <Notice tone="warning">Password awal belum disiapkan. Isi WAM_DEFAULT_PASSWORD (minimal 8 karakter) pada server, lalu muat ulang halaman ini.</Notice>}
    {noEmail.length > 0 && <Notice tone="info">{noEmail.length} orang belum punya email. Lengkapi di <a href={EMPLOYEES_ADMIN}>Data karyawan</a> (impor ulang Excel dengan kolom EMAIL, atau ubah satu per satu).</Notice>}
    <div className={styles.qrActions}>
      <Button type="button" disabled={!!busy || !passwordReady || missing.length === noEmail.length} onClick={() => run("create", praWamAccountsApi(), null, "POST")}>{busy === "create" ? "Membuat akun…" : `Buat ${missing.length - noEmail.length} akun`}</Button>
    </div>
    {message && <Notice tone={message.tone}>{message.text}{message.skipped?.length ? <ul>{message.skipped.map(item => <li key={item}>{item}</li>)}</ul> : null}</Notice>}

    <h2>Akun dan peran</h2>
    <p>Semua orang yang punya akun adalah peserta. Centang untuk menambah peran. Panitia, Admin WAM, dan HOD bisa digabung; <strong>BOD berdiri sendiri</strong>. Perubahan peran berlaku di halaman berikutnya yang dibuka orang itu, tanpa perlu masuk ulang.</p>
    <div style={{ overflowX: "auto" }}>
      <table className={styles.table}>
        <caption className="sr-only">Peran dan gabungannya</caption>
        <thead><tr><th>Peran</th><th>Yang bisa dilakukan</th><th>Bisa digabung dengan</th></tr></thead>
        <tbody>{roleGuide.map(item => <tr key={item.role}><td><strong>{item.role}</strong></td><td>{item.does}</td><td>{item.combines}</td></tr>)}</tbody>
      </table>
    </div>
    <input className="input" type="search" aria-label="Cari nama, departemen, atau email" placeholder="Cari nama, departemen, atau email" value={filter} onChange={event => setFilter(event.target.value)} />
    <div style={{ overflowX: "auto" }}>
      <table className={styles.table}>
        <thead><tr><th>Nama</th><th>Email</th><th>Akun</th>{praWamRoles.map(role => <th key={role}>{roleLabels[role]}</th>)}<th /></tr></thead>
        <tbody>{shown.map(row => {
          const standing = { isLead: row.leads.length > 0 };
          const blocked = blockedRoles(row.roles, standing);
          const clash = roleConflicts(row.roles, standing).length ? roleProblem(row.roles, standing) : null;
          const hintId = `peran-${row.employeeId}`;
          const hint = clash ? `${clash} Lepas BOD, atau lepas peran lainnya satu per satu.` : Object.values(blocked)[0];
          return <tr key={row.employeeId}>
          <td>{row.name}{!row.active && " (nonaktif)"}<br /><small>{row.department}</small>
            {row.leads.map(name => <span key={name} className={styles.guestBadge} style={{ display: "inline-block", marginTop: 4, marginRight: 4 }}>HOD · {name}</span>)}
            {hint && <div id={hintId} className={clash ? "field-error" : "field-hint"}>{hint}</div>}
            {rowError?.id === row.employeeId && <div role="alert" className="field-error">{rowError.text}</div>}
          </td>
          <td>{editing?.id === row.employeeId
            ? <form onSubmit={event => { event.preventDefault(); void run(`email-${row.employeeId}`, praWamAccountsApi(row.employeeId), { email: editing.email }, "PATCH", row.employeeId).then(ok => { if (ok) setEditing(null); }); }} style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                <input className="input" type="email" aria-label={`Email ${row.name}`} value={editing.email} maxLength={200} autoFocus style={{ minWidth: "14rem" }} onChange={event => setEditing({ id: row.employeeId, email: event.target.value })} />
                <Button type="submit" disabled={!!busy || !editing.email.trim()}>{busy === `email-${row.employeeId}` ? "Menyimpan…" : "Simpan"}</Button>
                <Button type="button" variant="quiet" disabled={!!busy} onClick={() => setEditing(null)}>Batal</Button>
              </form>
            : <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>{row.email || "—"}
                <button type="button" className="button button--quiet" style={{ minHeight: 44, minWidth: 44, padding: 0 }} aria-label={`Ubah email ${row.name}`} disabled={!!busy} onClick={() => setEditing({ id: row.employeeId, email: row.email })}><Pencil size={16} aria-hidden /></button>
              </span>}</td>
          <td>{!row.hasAccount ? "Belum ada" : row.lastLoginAt ? (row.mustChangePassword ? "Masuk, password awal" : "Masuk") : "Siap"}</td>
          {praWamRoles.map(role => <td key={role}><input type="checkbox" aria-label={`${roleLabels[role]}: ${row.name}`} title={blocked[role]} aria-describedby={hint ? hintId : undefined} checked={row.roles.includes(role)} disabled={!!busy || !!blocked[role]} onChange={() => toggleRole(row, role)} /></td>)}
          <td>{row.hasAccount && <Button type="button" variant="quiet" disabled={!!busy || !passwordReady} onClick={() => reset(row)}>{busy === `reset-${row.employeeId}` ? "Mengatur…" : "Reset password"}</Button>}</td>
        </tr>;
        })}</tbody>
      </table>
    </div>

    <h2>Ruang appraisal</h2>
    <p>Kapasitas tampil di form pesan ruang. Hanya ruang yang dicentang &ldquo;Bisa dipesan&rdquo; yang muncul di form.</p>
    <table className={styles.table}>
      <thead><tr><th>Ruang</th><th>Kapasitas</th><th>Bisa di-book</th><th /></tr></thead>
      <tbody>{rooms.map(room => <RoomRow key={`${room.id}-${room.capacity}-${room.bookable}`} room={room} onSaved={(next, text) => { setRooms(next); setMessage({ tone: "success", text }); }} />)}</tbody>
    </table>
  </div>;
}
