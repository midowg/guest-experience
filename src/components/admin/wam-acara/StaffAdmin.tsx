"use client";

import { useId, useMemo, useState } from "react";
import { Pencil, Trash2, UserPlus } from "lucide-react";
import { Card, ConsoleButton, Pill } from "@/components/console";
import { Notice } from "@/components/ui";
import { adminRequest, errorMessage } from "@/components/admin/shared/api";
import { SEKSI_MAX, SEKSI_SUGGESTIONS } from "@/lib/main-wam/staff";
import { mainWamAdminApi } from "@/lib/routes";
import type { WamStaffBoard, WamStaffMember } from "@/lib/server/main-wam/staff";
import css from "./staff.module.css";

export type StaffPerson = { id: string; fullName: string; department: string };
type Message = { tone: "success" | "error"; text: string } | null;

/**
 * Admin WAM 2026 → Panitia WAM (20 Nov 2026, KONTRAK §15): who is on the WAM event's committee, with a
 * seksi that is only a label. Panitia WAM get the tab Panitia and its tools in Main WAM and always test
 * it; Pra WAM's committee (Admin Pra WAM → Akun dan peran) is apart and is not copied here.
 */
export function StaffAdmin({ initial, people }: { initial: WamStaffBoard; people: StaffPerson[] }) {
  const id = useId();
  const [board, setBoard] = useState(initial);
  const [typed, setTyped] = useState("");
  const [seksi, setSeksi] = useState("");
  const [editing, setEditing] = useState<{ employeeId: string; seksi: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  const listed = useMemo(() => new Set(board.staff.map(member => member.employeeId)), [board.staff]);
  const options = useMemo(() => people.filter(person => !listed.has(person.id)).map(person => ({ ...person, label: `${person.fullName} · ${person.department || "Tanpa departemen"}` })), [people, listed]);
  const picked = options.find(option => option.label === typed);
  const locked = !board.migrated || !board.event;
  const bySeksi = useMemo(() => {
    const counts = new Map<string, number>();
    for (const member of board.staff) counts.set(member.seksi || "Tanpa seksi", (counts.get(member.seksi || "Tanpa seksi") ?? 0) + 1);
    return [...counts];
  }, [board.staff]);

  async function act(request: () => Promise<{ data?: WamStaffBoard; message: string }>, after?: () => void) {
    setBusy(true); setMessage(null);
    try {
      const result = await request();
      if (result.data) setBoard(result.data);
      after?.();
      setMessage({ tone: "success", text: result.message });
    } catch (problem) { setMessage({ tone: "error", text: errorMessage(problem) }); }
    finally { setBusy(false); }
  }
  const add = () => picked && void act(() => adminRequest<WamStaffBoard>(mainWamAdminApi.committee, { method: "POST", body: JSON.stringify({ employeeId: picked.id, seksi }) }), () => { setTyped(""); setSeksi(""); });
  const saveSeksi = (member: WamStaffMember, next: string) => void act(() => adminRequest<WamStaffBoard>(mainWamAdminApi.committeeMember(member.employeeId), { method: "PATCH", body: JSON.stringify({ seksi: next }) }), () => setEditing(null));
  const remove = (member: WamStaffMember) => {
    if (!window.confirm(`Hapus ${member.fullName} dari Panitia WAM? Akun WAM dan perannya di Pra WAM tetap.`)) return;
    void act(() => adminRequest<WamStaffBoard>(mainWamAdminApi.committeeMember(member.employeeId), { method: "DELETE" }));
  };

  return <div className="stack">
    {!board.migrated && <Notice tone="warning">Panitia WAM menunggu migrasi <code>202611200603</code> (admin_wam_acara). Sampai itu WAM 2026 belum punya panitia; hanya penguji di daftar Pengaturan yang bisa mencobanya.</Notice>}
    {board.migrated && !board.event && <Notice tone="warning">Acara WAM belum ada. Siapkan dulu di Admin Pra WAM → Acara dan modul.</Notice>}
    <div aria-live="polite">{message && <Notice tone={message.tone} role={message.tone === "error" ? "alert" : "status"}>{message.text}</Notice>}</div>

    <Card title="Tambah panitia" id={`${id}-tambah`}>
      <p className={css.note}>Panitia WAM mendapat tab Panitia di aplikasi WAM 2026 (Rundown live, Absen manual, Pengumuman, Moderasi) dan selalu menjadi penguji. Seksi hanya label; semua seksi punya hak yang sama. BOD tidak bisa menjadi panitia.</p>
      <div className={css.pick}>
        <div className="field">
          <label htmlFor={`${id}-cari`}>Karyawan</label>
          <input id={`${id}-cari`} className="input" list={`${id}-orang`} value={typed} placeholder="Ketik nama karyawan" autoComplete="off" disabled={busy || locked} onChange={change => setTyped(change.target.value)} />
          <datalist id={`${id}-orang`}>{options.map(option => <option key={option.id} value={option.label} />)}</datalist>
        </div>
        <div className="field">
          <label htmlFor={`${id}-seksi`}>Seksi (boleh kosong)</label>
          <input id={`${id}-seksi`} className="input" list={`${id}-seksi-saran`} value={seksi} maxLength={SEKSI_MAX} placeholder="Mis. Acara" autoComplete="off" disabled={busy || locked} onChange={change => setSeksi(change.target.value)} />
          <SeksiOptions id={`${id}-seksi-saran`} />
        </div>
        <ConsoleButton variant="primary" icon={<UserPlus size={16} aria-hidden />} disabled={busy || locked || !picked} onClick={add}>{busy ? "Menyimpan…" : "Tambah"}</ConsoleButton>
      </div>
    </Card>

    <Card title={`Panitia WAM (${board.staff.length})`} id={`${id}-daftar`}>
      {board.staff.length > 0 && <ul className={css.summary} aria-label="Jumlah per seksi">
        {bySeksi.map(([label, count]) => <li key={label}><Pill tone="neutral">{label} · {count}</Pill></li>)}
      </ul>}
      {board.staff.length === 0 ? <p className={css.note}>Belum ada panitia. Tanpa panitia, tab Panitia di WAM 2026 tidak muncul untuk siapa pun.</p>
        : <ul className={css.rows} aria-label="Daftar Panitia WAM">
          {board.staff.map(member => {
            const open = editing?.employeeId === member.employeeId;
            return <li key={member.employeeId} className={css.row}>
              <span className={css.who}>
                <strong>{member.fullName}</strong>
                <span>{member.department || "Tanpa departemen"}{member.grantedBy ? ` · ditambahkan oleh ${member.grantedBy}` : ""}</span>
                <span className={css.tags}>
                  <Pill tone={member.seksi ? "blue" : "neutral"}>{member.seksi || "Tanpa seksi"}</Pill>
                  {!member.hasAccount && <Pill tone="warn">Belum punya akun WAM</Pill>}
                </span>
              </span>
              <span className={css.actions}>
                <ConsoleButton disabled={busy || locked} icon={<Pencil size={16} aria-hidden />} aria-expanded={open} aria-label={`Ubah seksi ${member.fullName}`}
                  onClick={() => setEditing(open ? null : { employeeId: member.employeeId, seksi: member.seksi })}>Seksi</ConsoleButton>
                <ConsoleButton disabled={busy || locked} icon={<Trash2 size={16} aria-hidden />} aria-label={`Hapus ${member.fullName} dari Panitia WAM`} onClick={() => remove(member)}>Hapus</ConsoleButton>
              </span>
              {open && <form className={css.edit} onSubmit={submit => { submit.preventDefault(); saveSeksi(member, editing.seksi); }}>
                <div className="field">
                  <label htmlFor={`${id}-ubah-${member.employeeId}`}>Seksi {member.fullName}</label>
                  <input id={`${id}-ubah-${member.employeeId}`} className="input" list={`${id}-seksi-saran`} value={editing.seksi} maxLength={SEKSI_MAX} autoComplete="off" autoFocus
                    onChange={change => setEditing({ employeeId: member.employeeId, seksi: change.target.value })} />
                </div>
                <ConsoleButton type="submit" variant="primary" disabled={busy}>{busy ? "Menyimpan…" : "Simpan"}</ConsoleButton>
                <ConsoleButton disabled={busy} onClick={() => setEditing(null)}>Batal</ConsoleButton>
              </form>}
            </li>;
          })}
        </ul>}
    </Card>
  </div>;
}

function SeksiOptions({ id }: { id: string }) {
  return <datalist id={id}>{SEKSI_SUGGESTIONS.map(label => <option key={label} value={label} />)}</datalist>;
}
