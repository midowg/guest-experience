"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, PartyPopper, Pencil, Plus, X } from "lucide-react";
import { Card, ConsoleButton, ConsoleButtonLink, PageHeader, Pill, SearchField, type ConsoleTone } from "@/components/console";
import { adminRequest, errorMessage } from "@/components/admin/shared/api";
import { LEAVE_TYPES, leaveDays, leaveLabels, leaveStatusLabels, spanLabel, type AdminLeave, type LeaveStatus, type LeaveType } from "@/lib/hr/leave";
import { hrAdminApi, hrAdminPath } from "@/lib/routes";
import { Flash } from "./Flash";
import css from "./hr-admin.module.css";

type Message = { tone: "success" | "error"; text: string } | null;
const tone: Record<LeaveStatus, ConsoleTone> = { menunggu: "warn", disetujui: "ok", ditolak: "bad", dibatalkan: "neutral" };
const sent = (iso: string) => new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(new Date(iso));
const longSpan = (start: string, end: string) => {
  const say = (date: string) => new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
  return start === end ? say(start) : `${say(start)} – ${say(end)}`;
};

/**
 * Admin HR → Cuti & izin (21 Nov 2026): cuti, sakit, izin and dinas asked for in WG People, the
 * oldest waiting first, with who, which days, how many, and why. Setujui puts it in the team's
 * calendar and colours those days in Rekap bulanan; Tolak needs a reason. A waiting one already
 * shows to the team as waiting. An approved one can be withdrawn here when plans change (the
 * employee can only withdraw a waiting one). One's own request is decided by someone else. Find a
 * name in both lists. Admin HR also records one for an employee (approved at once: a sick call by
 * phone, a cuti agreed in person) and changes the kind, days or note of a waiting or approved one
 * (21 Nov 2026, the audit); each form opens where it was asked for, its first field focused.
 */
type Person = { employeeId: string; name: string; department: string };
type Draft = { employeeId: string; type: LeaveType; startDate: string; endDate: string; note: string };
const today = () => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);

/** The fields of a cuti/sakit/izin/dinas: who (only when recording a new one), kind, first and last day, note. */
function LeaveFields({ draft, people, busy, onChange, onSave, onCancel, saveLabel }: {
  draft: Draft; people: Person[] | null; busy: boolean; onChange(draft: Draft): void; onSave(): void; onCancel(): void; saveLabel: string;
}) {
  const first = useRef<HTMLSelectElement>(null);
  useEffect(() => {
    first.current?.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    first.current?.focus({ preventScroll: true });
  }, []);
  const days = draft.endDate >= draft.startDate ? leaveDays(draft.startDate, draft.endDate) : 0;
  const ready = (!people || draft.employeeId) && days > 0 && days <= 61 && draft.note.trim().length >= 3;
  return <div className={css.editBox}>
    <div className={css.form}>
      {people && <label className={`${css.field} ${css.grow}`}>Karyawan
        <select ref={first} value={draft.employeeId} onChange={event => onChange({ ...draft, employeeId: event.target.value })}>
          <option value="">Pilih karyawan</option>
          {people.map(person => <option key={person.employeeId} value={person.employeeId}>{person.name}{person.department ? ` · ${person.department}` : ""}</option>)}
        </select>
      </label>}
      <label className={css.field}>Jenis
        <select ref={people ? undefined : first} value={draft.type} onChange={event => onChange({ ...draft, type: event.target.value as LeaveType })}>{LEAVE_TYPES.map(type => <option key={type} value={type}>{leaveLabels[type]}</option>)}</select>
      </label>
      <label className={css.field}>Mulai<input type="date" value={draft.startDate} onChange={event => event.target.value && onChange({ ...draft, startDate: event.target.value, endDate: draft.endDate < event.target.value ? event.target.value : draft.endDate })} /></label>
      <label className={css.field}>Sampai<input type="date" min={draft.startDate} value={draft.endDate} onChange={event => event.target.value && onChange({ ...draft, endDate: event.target.value })} /></label>
      <label className={`${css.field} ${css.grow}`}>Keterangan<input type="text" maxLength={300} value={draft.note} onChange={event => onChange({ ...draft, note: event.target.value })} placeholder="Mis. sakit, kabar lewat telepon" /></label>
    </div>
    <p className={css.muted}>{days > 0 ? `${days} hari.` : "Tanggal selesai tidak boleh sebelum tanggal mulai."}{days > 61 ? " Paling lama 61 hari." : ""}{people ? " Langsung disetujui dan masuk kalender tim." : ""}</p>
    <div className={css.actions}>
      <ConsoleButton variant="primary" icon={<Check size={16} aria-hidden />} disabled={busy || !ready} onClick={onSave}>{saveLabel}</ConsoleButton>
      <ConsoleButton disabled={busy} onClick={onCancel}>Batal</ConsoleButton>
    </div>
  </div>;
}

export function LeaveQueue({ initial, people = [] }: { initial: AdminLeave[]; people?: Person[] }) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [query, setQuery] = useState("");
  const [refusing, setRefusing] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  /** The open form: a new one (id null) or a change to one request. */
  const [editing, setEditing] = useState<{ id: string | null; draft: Draft } | null>(null);
  const startNew = () => { setRefusing(null); setEditing({ id: null, draft: { employeeId: "", type: "sakit", startDate: today(), endDate: today(), note: "" } }); };
  const startEdit = (item: AdminLeave) => { setRefusing(null); setEditing({ id: item.id, draft: { employeeId: item.employeeId, type: item.type, startDate: item.startDate, endDate: item.endDate, note: item.note } }); };
  const clearMessage = useCallback(() => setMessage(null), []);
  const needle = query.trim().toLowerCase();
  const found = items.filter(item => !needle || `${item.name} ${item.department} ${leaveLabels[item.type]}`.toLowerCase().includes(needle));
  const waiting = found.filter(item => item.status === "menunggu");
  const decided = found.filter(item => item.status !== "menunggu").slice(0, 30);

  /** The list as it is now (after a 409: someone else decided, or the employee withdrew it). */
  async function reload() {
    try { const result = await adminRequest<AdminLeave[]>(hrAdminApi.leaves); if (result.data) setItems(result.data); } catch { /* keep what is shown */ }
  }
  async function decide(item: AdminLeave, approve: boolean) {
    setBusy(true); setMessage(null);
    try {
      const result = await adminRequest<AdminLeave>(hrAdminApi.leave(item.id), { method: "POST", body: JSON.stringify({ approve, note: approve ? "" : note }) });
      setItems(list => list.map(entry => entry.id === item.id ? { ...entry, status: approve ? "disetujui" : "ditolak", decisionNote: approve ? null : note } : entry));
      setMessage({ tone: "success", text: `${result.message} (${item.name})` });
      setRefusing(null); setNote(""); router.refresh();
    } catch (error) { setMessage({ tone: "error", text: errorMessage(error) }); await reload(); }
    finally { setBusy(false); }
  }
  async function withdraw(item: AdminLeave) {
    setBusy(true); setMessage(null);
    try {
      const result = await adminRequest<AdminLeave>(hrAdminApi.leaveCancel(item.id), { method: "POST", body: JSON.stringify({ note }) });
      setItems(list => list.map(entry => entry.id === item.id ? { ...entry, status: "dibatalkan", decisionNote: result.data?.decisionNote ?? null } : entry));
      setMessage({ tone: "success", text: `${result.message} (${item.name})` });
      setRefusing(null); setNote(""); router.refresh();
    } catch (error) { setMessage({ tone: "error", text: errorMessage(error) }); await reload(); }
    finally { setBusy(false); }
  }
  const openRefusal = (id: string) => { setEditing(null); setRefusing(id); setNote(""); };
  async function saveEditing() {
    if (!editing) return;
    setBusy(true); setMessage(null);
    const { employeeId, ...fields } = editing.draft;
    try {
      if (editing.id) {
        const id = editing.id;
        const result = await adminRequest<AdminLeave>(hrAdminApi.leave(id), { method: "PUT", body: JSON.stringify(fields) });
        setItems(list => list.map(entry => entry.id === id && result.data ? { ...entry, ...result.data } : entry));
        setMessage({ tone: "success", text: result.message });
      } else {
        const result = await adminRequest<AdminLeave>(hrAdminApi.leaves, { method: "POST", body: JSON.stringify({ employeeId, ...fields }) });
        if (result.data) setItems(list => [result.data!, ...list]);
        setMessage({ tone: "success", text: result.message });
      }
      setEditing(null); router.refresh();
    } catch (error) { setMessage({ tone: "error", text: errorMessage(error) }); }
    finally { setBusy(false); }
  }

  return <>
    <PageHeader title="Cuti & izin" subtitle="Cuti, sakit, izin, dan dinas yang diajukan karyawan di WG People. Yang disetujui masuk kalender tim dan Rekap bulanan."
      actions={<>
        <ConsoleButton variant="primary" icon={<Plus size={16} aria-hidden />} disabled={busy || people.length === 0} onClick={startNew}>Catat cuti/izin</ConsoleButton>
        <ConsoleButtonLink href={hrAdminPath.month()}>Buka Rekap bulanan</ConsoleButtonLink>
      </>} />
    {editing && !editing.id && <Card title="Catat cuti, sakit, izin, atau dinas">
      <LeaveFields draft={editing.draft} people={people} busy={busy} saveLabel="Simpan dan setujui"
        onChange={draft => setEditing({ ...editing, draft })} onSave={() => void saveEditing()} onCancel={() => setEditing(null)} />
    </Card>}
    <Flash message={message} onClose={clearMessage} />
    <div className={css.toolbar}><SearchField label="Cari pengajuan" placeholder="Cari nama, departemen, atau jenis" value={query} onChange={setQuery} /></div>
    {waiting.length === 0
      ? <Card title="Tidak ada yang menunggu"><div className={css.empty}><PartyPopper size={32} aria-hidden /><p>{needle ? "Tidak ada yang cocok dengan pencarian ini." : "Pengajuan baru dari karyawan akan muncul di sini."}</p></div></Card>
      : <Card title={`${waiting.length} pengajuan menunggu`}>
        <ul className={css.rows}>{waiting.map(item => <li key={item.id} className={css.row}>
          <div className={css.rowHead}>
            <span className={css.who}><strong>{item.name}</strong><span className={css.muted}>{item.department || "Tanpa departemen"}</span></span>
            <span className={css.cell} data-kind={item.type} data-waiting>{leaveLabels[item.type]}</span>
          </div>
          <dl className={css.facts}>
            <dt>Tanggal</dt><dd><strong>{longSpan(item.startDate, item.endDate)}</strong> ({leaveDays(item.startDate, item.endDate)} hari)</dd>
            <dt>Keterangan</dt><dd>{item.note}</dd>
            <dt>Diajukan</dt><dd>{sent(item.createdAt)} WIB</dd>
          </dl>
          {editing?.id === item.id
            ? <LeaveFields draft={editing.draft} people={null} busy={busy} saveLabel="Simpan perubahan"
              onChange={draft => setEditing({ ...editing, draft })} onSave={() => void saveEditing()} onCancel={() => setEditing(null)} />
            : refusing === item.id
            ? <div className={css.actions}>
              <label className={`${css.field} ${css.grow}`}>Alasan ditolak<input type="text" maxLength={300} value={note} autoFocus onChange={event => setNote(event.target.value)} placeholder="Mis. bentrok dengan acara klien" /></label>
              <ConsoleButton variant="primary" icon={<X size={16} aria-hidden />} disabled={busy || note.trim().length < 3} onClick={() => void decide(item, false)}>Tolak {leaveLabels[item.type].toLowerCase()}</ConsoleButton>
              <ConsoleButton disabled={busy} onClick={() => { setRefusing(null); setNote(""); }}>Batal</ConsoleButton>
            </div>
            : <div className={css.actions}>
              <ConsoleButton variant="primary" icon={<Check size={16} aria-hidden />} disabled={busy} onClick={() => void decide(item, true)}>Setujui</ConsoleButton>
              <ConsoleButton icon={<X size={16} aria-hidden />} disabled={busy} onClick={() => openRefusal(item.id)}>Tolak</ConsoleButton>
              <ConsoleButton icon={<Pencil size={16} aria-hidden />} disabled={busy} onClick={() => startEdit(item)}>Ubah</ConsoleButton>
            </div>}
        </li>)}</ul>
      </Card>}
    {decided.length > 0 && <Card title="Baru diputuskan">
      <ul className={css.rows}>{decided.map(item => <li key={item.id} className={css.row}>
        <div className={css.rowHead}>
          <span className={css.who}><strong>{item.name}</strong><span className={css.muted}>{leaveLabels[item.type]} · {spanLabel(item.startDate, item.endDate)} ({leaveDays(item.startDate, item.endDate)} hari)</span></span>
          <Pill tone={tone[item.status]}>{leaveStatusLabels[item.status]}</Pill>
        </div>
        {(item.decisionNote || item.decidedLabel) && <p className={css.muted}>{item.decidedLabel ? `Oleh ${item.decidedLabel}` : ""}{item.decisionNote ? ` · ${item.decisionNote}` : ""}</p>}
        {item.status === "disetujui" && editing?.id === item.id && <LeaveFields draft={editing.draft} people={null} busy={busy} saveLabel="Simpan perubahan"
          onChange={draft => setEditing({ ...editing, draft })} onSave={() => void saveEditing()} onCancel={() => setEditing(null)} />}
        {item.status === "disetujui" && editing?.id !== item.id && (refusing === `batal-${item.id}`
          ? <div className={css.actions}>
            <label className={`${css.field} ${css.grow}`}>Kenapa dibatalkan (boleh kosong)<input type="text" maxLength={250} value={note} autoFocus onChange={event => setNote(event.target.value)} placeholder="Mis. jadwal berubah" /></label>
            <ConsoleButton variant="primary" disabled={busy} onClick={() => void withdraw(item)}>Batalkan {leaveLabels[item.type].toLowerCase()}</ConsoleButton>
            <ConsoleButton disabled={busy} onClick={() => { setRefusing(null); setNote(""); }}>Tidak jadi</ConsoleButton>
          </div>
          : <div className={css.actions}>
            <ConsoleButton icon={<Pencil size={16} aria-hidden />} disabled={busy} onClick={() => startEdit(item)}>Ubah</ConsoleButton>
            <ConsoleButton disabled={busy} onClick={() => openRefusal(`batal-${item.id}`)}>Batalkan</ConsoleButton>
          </div>)}
      </li>)}</ul>
    </Card>}
  </>;
}
