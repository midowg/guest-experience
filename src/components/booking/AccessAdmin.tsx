"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AlertTriangle, CheckCircle2, ShieldCheck, UserPlus } from "lucide-react";
import { errorText, praWamRequest } from "@/components/pra-wam/api";
import { bookingApi } from "@/lib/routes";
import css from "./booking.module.css";

export type AccessPerson = { employeeId: string; name: string; department: string; hasAccount: boolean; booking: boolean; wamAdmin: boolean };

/**
 * Kelola → Akses: who manages Booking Kantor. Admin Booking is given and taken here (or in Admin
 * WAM → Akun dan peran); Admin WAM always has it. Someone without a WAM account cannot sign in yet.
 */
export function AccessAdmin({ people, meId }: { people: AccessPerson[]; meId: string }) {
  const router = useRouter();
  const [pick, setPick] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const admins = people.filter(person => person.booking || person.wamAdmin).sort((a, b) => a.name.localeCompare(b.name));
  const others = people.filter(person => !person.booking).sort((a, b) => a.name.localeCompare(b.name));
  const picked = people.find(person => person.employeeId === pick);

  async function set(employeeId: string, on: boolean) {
    setBusy(true); setResult(null);
    try { const { message } = await praWamRequest(bookingApi.access(employeeId), { method: "PUT", json: { on } }); setResult({ ok: true, text: message }); setPick(""); router.refresh(); }
    catch (error) { setResult({ ok: false, text: errorText(error) }); }
    finally { setBusy(false); }
  }

  return <>
    {result && <p className={result.ok ? css.noteOk : css.noteBad} role={result.ok ? "status" : "alert"}>{result.ok ? <CheckCircle2 size={18} aria-hidden /> : <AlertTriangle size={18} aria-hidden />}{result.text}</p>}

    <form className={css.addRow} onSubmit={event => { event.preventDefault(); if (pick) void set(pick, true); }}>
      <div className={css.field}><label className={css.label} htmlFor="access-pick"><UserPlus size={18} aria-hidden />Tambah Admin Booking</label>
        <select id="access-pick" className={css.control} value={pick} onChange={event => setPick(event.target.value)}>
          <option value="">Pilih karyawan</option>
          {others.map(person => <option key={person.employeeId} value={person.employeeId}>{person.name} · {person.department}</option>)}
        </select>
        {picked && !picked.hasAccount && <p className={css.hint}>Orang ini belum punya akun WAM, jadi belum bisa masuk. Buat akunnya di Admin WAM → Akun dan peran.</p>}
      </div>
      <button type="submit" className={css.btn} disabled={busy || !pick}>Jadikan Admin Booking</button>
    </form>

    <ul className={css.list}>{admins.map(person => <li key={person.employeeId} className={css.itemRow}>
      <div className={css.itemMain}>
        <h3>{person.name}{person.employeeId === meId ? " (kamu)" : ""}</h3>
        <div className={css.itemTags}>
          <span className={css.chipInfo}>{person.department || "Tanpa departemen"}</span>
          {person.booking && <span className={css.chipFree}><ShieldCheck size={14} aria-hidden />Admin Booking</span>}
          {person.wamAdmin && <span className={css.chip}>Admin WAM, otomatis</span>}
          {!person.hasAccount && <span className={css.chipWarn}>Belum punya akun</span>}
        </div>
      </div>
      {person.booking && person.employeeId !== meId && <button type="button" className={css.btnDanger} disabled={busy} onClick={() => void set(person.employeeId, false)}>Cabut</button>}
    </li>)}</ul>
  </>;
}
