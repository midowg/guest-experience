"use client";

import { useState } from "react";
import { Button, Notice } from "@/components/ui";
import { adminRequest, errorMessage } from "@/components/admin/shared/api";
import { praWamUnitsApi } from "@/lib/routes";
import type { Membership, Unit } from "@/lib/server/pra-wam/units";
import styles from "@/components/admin/admin.module.css";

type People = { id: string; name: string }[];
type Message = { tone: "success" | "error"; text: string; list?: string[] } | null;

/**
 * Admin WAM → Unit dan jabatan: the units with their people and leads, imported from the "Unit dan
 * jabatan" sheet of the Data karyawan workbook. It only writes WAM units; Data karyawan itself
 * stays with the super admin.
 */
export function PraWamUnits({ initialUnits, initialMemberships, migrated, people }: { initialUnits: Unit[]; initialMemberships: Membership[]; migrated: boolean; people: People }) {
  const [units, setUnits] = useState(initialUnits);
  const [memberships, setMemberships] = useState(initialMemberships);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  const name = (id: string) => people.find(person => person.id === id)?.name ?? "Tanpa nama";

  async function upload() {
    if (!file) return;
    setBusy(true); setMessage(null);
    const body = new FormData();
    body.set("file", file);
    try {
      const result = await adminRequest<{ units: Unit[]; memberships: Membership[]; unmatched: string[]; skipped: string[] }>(praWamUnitsApi, { method: "POST", body });
      if (result.data) { setUnits(result.data.units); setMemberships(result.data.memberships); }
      setMessage({ tone: "success", text: result.message, list: [...(result.data?.unmatched ?? []).map(item => `Tidak ditemukan di Data karyawan: ${item}`), ...(result.data?.skipped ?? [])] });
    } catch (error) { setMessage({ tone: "error", text: errorMessage(error) }); }
    finally { setBusy(false); }
  }

  return <div className="stack">
    <h2>Unit dan jabatan</h2>
    {!migrated ? <Notice tone="warning">Unit menunggu migrasi 202611040003_pra_wam_events_units.sql.</Notice> : <>
      <p>Unggah berkas Data karyawan yang punya sheet <strong>Unit dan jabatan</strong> (kolom NIP, Nama panggilan, Jenis unit, Unit, Jabatan di unit, Utama). Satu orang boleh ada di beberapa unit; baris &ldquo;Lead departemen&rdquo; atau &ldquo;Lead BU&rdquo; menjadikannya lead. Impor mengganti semua keanggotaan dengan isi sheet.</p>
      <p><small>Impor ini hanya mengisi unit WAM. Data karyawan (NIP dan data pribadi) tidak berubah dan tetap diatur super admin.</small></p>
      <div className={styles.qrActions}>
        <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" aria-label="Berkas Excel unit dan jabatan" onChange={change => setFile(change.target.files?.[0] ?? null)} />
        <Button type="button" disabled={busy || !file} onClick={upload}>{busy ? "Mengimpor…" : "Impor unit dan jabatan"}</Button>
      </div>
      {units.length > 0 && <div style={{ overflowX: "auto" }}><table className={styles.table}>
        <thead><tr><th>Unit</th><th>Lead</th><th>Anggota</th></tr></thead>
        <tbody>{units.map(unit => {
          const members = memberships.filter(member => member.unitId === unit.id);
          const leads = members.filter(member => member.isLead).map(member => name(member.employeeId));
          return <tr key={unit.id}>
            <td>{unit.name}{unit.code && unit.code !== unit.name ? ` (${unit.code})` : ""}<br /><small>{unit.kind === "bu" ? "BU" : "Departemen"}</small></td>
            <td>{leads.length ? leads.join(", ") : "Belum ditentukan"}</td>
            <td>{members.length}</td>
          </tr>;
        })}</tbody>
      </table></div>}
    </>}
    {message && <Notice tone={message.tone}>{message.text}{message.list?.length ? <ul>{message.list.map(item => <li key={item}>{item}</li>)}</ul> : null}</Notice>}
  </div>;
}
