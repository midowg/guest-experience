"use client";

import { useId, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Card, ConsoleButton, Pill } from "@/components/console";
import { Notice } from "@/components/ui";
import { adminRequest, errorMessage } from "@/components/admin/shared/api";
import { ADMIN_METHODS, ADMIN_NOMINEE_KINDS, adminRange, adminWhen, nomineeKindLabels, WAITING_TEXT, type AwardCategoryInput, type NomineeInput } from "@/lib/main-wam/modul/admin";
import { approvalRefusal, methodLabel } from "@/lib/main-wam/modul/awards";
import { votingState } from "@/lib/main-wam/module-state";
import { wibDate, wibTime } from "@/lib/main-wam/rundown";
import type { MwAwardCategory, NomineeKind } from "@/lib/main-wam/types";
import { mainWamAdminApi } from "@/lib/routes";
import type { AdminAwards } from "@/lib/server/main-wam/modul/admin";
import css from "./modul-admin.module.css";

type Message = { tone: "success" | "error"; text: string } | null;

/** "2027-01-06T08:00" (WIB, for <input type="datetime-local">) ↔ an ISO instant. */
export const toLocal = (iso: string | null) => (iso ? `${wibDate(iso)}T${wibTime(iso)}` : "");
export const fromLocal = (value: string) => (value ? `${value}:00+07:00` : null);
const stamp = adminWhen;

const methodWords: Record<(typeof ADMIN_METHODS)[number], string> = { voting: "Voting karyawan", juri: "Juri BOD" };

/**
 * Admin WAM 2026 → Awarding (agen D): categories (voted or judged), their window and
 * announcement time, the nominees (people, Momen photos, a kelompok or a department), and, once
 * voting closed, the count per nominee with the winner's approval, now given here by an admin (audit M1: no running count, as the
 * BOD). Never who voted for whom.
 */
export function AwardsAdmin({ initial, now: nowIso }: { initial: AdminAwards; /** Preview only: the moment shown. */ now?: string }) {
  const [data, setData] = useState(initial);
  const [message, setMessage] = useState<Message>(null);
  const [editing, setEditing] = useState<string | "baru" | null>(null);
  const [nominating, setNominating] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const sessions = useMemo(() => new Map(data.sessions.map(session => [session.id, session])), [data.sessions]);

  async function reload(text: string) {
    const fresh = await adminRequest<AdminAwards>(mainWamAdminApi.awardCategories);
    setData(fresh.data!);
    setMessage({ tone: "success", text });
  }
  async function run(action: () => Promise<string>) {
    setBusy(true); setMessage(null);
    try { await reload(await action()); return true; }
    catch (problem) { setMessage({ tone: "error", text: errorMessage(problem) }); return false; }
    finally { setBusy(false); }
  }

  return <div className={css.stack}>
    {!data.migrated && <Notice tone="warning">{WAITING_TEXT}</Notice>}
    <div aria-live="polite">{message && <Notice tone={message.tone}>{message.text}</Notice>}</div>
    <p className={css.note}>Peserta memilih satu nominasi per kategori selama voting dibuka (bisa diubah sampai ditutup, tidak bisa memilih diri sendiri). Perolehan suara tampil di sini dan ke BOD setelah voting ditutup, tidak pernah ke peserta. Persetujuan pemenang sekarang dilakukan di sini (tombol &ldquo;Setujui sebagai pemenang&rdquo; pada tiap nominasi, setelah voting ditutup; kategori juri kapan saja), bukan lagi oleh BOD di aplikasi. Pengumuman pemenang di aplikasi menunggu persetujuan ini, dan panitia diberi kabar saat disetujui.</p>
    {data.categories.map(category => {
      const tally = data.tallies.find(item => item.categoryId === category.id);
      const approval = data.approvals.find(item => item.categoryId === category.id);
      const nominee = (id: string) => nomineeLabel(category, id, data);
      const clock = nowIso ? new Date(nowIso) : new Date();
      const state = category.method === "voting" ? votingState(category, clock) : null;
      return <Card key={category.id} title={category.title} id={`kategori-${category.id}`}>
        <div className={css.badges}>
          <Pill tone={category.published ? "ok" : "neutral"}>{category.published ? "Terbit" : "Draf"}</Pill>
          <Pill tone="blue">{methodLabel(category)}</Pill>
          {state && <Pill tone={state === "buka" ? "ok" : "neutral"}>{state === "buka" ? "Voting dibuka" : state === "belum" ? "Belum dibuka" : "Ditutup"}</Pill>}
          {approval && <Pill tone="brass">Disetujui</Pill>}
        </div>
        <p className={css.meta}>
          {category.method === "voting" && <span>Voting {adminRange(category.opensAt, category.closesAt)}</span>}
          <span>Diumumkan {stamp(category.announceAt)}</span>
          <span>Sesi: {category.sessionId ? sessions.get(category.sessionId)?.title ?? "–" : "–"}</span>
          <span>Nominasi: {nomineeKindLabels[category.nomineeKind]} ({category.nominees.length})</span>
        </p>
        {category.description && <p className={css.note}>{category.description}</p>}
        {category.nominees.length > 0 && <ul className={css.rows} aria-label={`Nominasi ${category.title}`}>
          {(tally ? tally.rows : category.nominees.map(item => ({ nomineeId: item.id, votes: null as number | null, rank: null as number | null }))).map(row => <li key={row.nomineeId} className={css.row}>
            {row.rank !== null && <span className={css.rank}>{row.rank}</span>}
            <span className={css.rowText}><span>{nominee(row.nomineeId)}</span>{approval?.nomineeId === row.nomineeId && <span>Pemenang · disetujui {(approval.approvedBy && data.approverNames[approval.approvedBy]) || (approval.approvedBy ? "BOD" : "Admin")} {stamp(approval.approvedAt)}</span>}</span>
            {row.votes !== null && <span className={css.votes}>{row.votes} suara</span>}
            {approval?.nomineeId !== row.nomineeId && !approvalRefusal(category, row.nomineeId, clock) && <ConsoleButton disabled={busy || !data.migrated}
              onClick={() => { if (window.confirm(`${approval ? "Ganti pemenang dengan" : "Setujui"} ${nominee(row.nomineeId)} sebagai pemenang ${category.title}? Panitia diberi kabar.`)) void run(async () => (await adminRequest(mainWamAdminApi.awardApprove(category.id), { method: "POST", body: JSON.stringify({ nomineeId: row.nomineeId }) })).message); }}>Setujui sebagai pemenang</ConsoleButton>}
          </li>)}
        </ul>}
        {tally && <p className={css.small}>{tally.total} suara masuk. Hanya jumlah per nominasi; siapa memilih siapa tidak ditampilkan.</p>}
        {!tally && (state === "buka" || state === "belum") && <p className={css.small}>Perolehan suara tampil setelah voting ditutup.</p>}
        {editing === category.id && <CategoryForm category={category} data={data} busy={busy} onCancel={() => setEditing(null)}
          onSave={input => run(async () => (await adminRequest(mainWamAdminApi.awardCategory(category.id), { method: "PATCH", body: JSON.stringify(input) })).message).then(ok => { if (ok) setEditing(null); })} />}
        {nominating === category.id && <NomineesForm category={category} data={data} busy={busy} onCancel={() => setNominating(null)}
          onSave={nominees => run(async () => (await adminRequest(mainWamAdminApi.awardNominees(category.id), { method: "PUT", body: JSON.stringify({ nominees }) })).message).then(ok => { if (ok) setNominating(null); })} />}
        {editing !== category.id && nominating !== category.id && <div className={css.actions}>
          <ConsoleButton disabled={busy || !data.migrated} onClick={() => { setNominating(null); setEditing(category.id); }}>Ubah</ConsoleButton>
          <ConsoleButton disabled={busy || !data.migrated} onClick={() => { setEditing(null); setNominating(category.id); }}>Nominasi</ConsoleButton>
          <ConsoleButton disabled={busy || !data.migrated} icon={<Trash2 size={16} aria-hidden />}
            onClick={() => { if (window.confirm(`Hapus kategori ${category.title}?`)) void run(async () => (await adminRequest(mainWamAdminApi.awardCategory(category.id), { method: "DELETE" })).message); }}>Hapus</ConsoleButton>
        </div>}
      </Card>;
    })}
    {editing === "baru"
      ? <Card title="Kategori baru" id="kategori-baru">
        <CategoryForm category={null} data={data} busy={busy} onCancel={() => setEditing(null)}
          onSave={input => run(async () => (await adminRequest(mainWamAdminApi.awardCategories, { method: "POST", body: JSON.stringify(input) })).message).then(ok => { if (ok) setEditing(null); })} />
      </Card>
      : <div><ConsoleButton variant="primary" icon={<Plus size={16} aria-hidden />} disabled={busy || !data.migrated} onClick={() => setEditing("baru")}>Tambah kategori</ConsoleButton></div>}
  </div>;
}

/** A nominee in admin words: full name and department, "Foto · <owner>", or the name. */
function nomineeLabel(category: MwAwardCategory, id: string, data: AdminAwards): string {
  const nominee = category.nominees.find(item => item.id === id);
  if (!nominee) return "Nominasi";
  if (nominee.employeeId) { const person = data.people.find(item => item.id === nominee.employeeId); return person ? `${person.fullName} · ${person.department || "–"}` : "Karyawan (tidak aktif)"; }
  if (nominee.photoId) { const photo = data.photos.find(item => item.id === nominee.photoId); return `Foto · ${photo?.owner ?? "peserta"}`; }
  return nominee.label;
}

function CategoryForm({ category, data, busy, onSave, onCancel }: { category: MwAwardCategory | null; data: AdminAwards; busy: boolean; onSave: (input: AwardCategoryInput) => void; onCancel: () => void }) {
  const id = useId();
  const [form, setForm] = useState(() => ({
    title: category?.title ?? "", description: category?.description ?? "", method: (category?.method === "juri" ? "juri" : "voting") as AwardCategoryInput["method"],
    nomineeKind: category?.nomineeKind ?? "orang" as NomineeKind, opensAt: toLocal(category?.opensAt ?? null), closesAt: toLocal(category?.closesAt ?? null),
    announceAt: toLocal(category?.announceAt ?? null), sessionId: category?.sessionId ?? "", sort: category?.sort ?? data.categories.length + 1, published: category?.published ?? false,
  }));
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm(current => ({ ...current, [key]: value }));
  const submit = () => onSave({
    title: form.title, description: form.description, method: form.method, nomineeKind: form.nomineeKind,
    opensAt: form.method === "voting" ? fromLocal(form.opensAt) : null, closesAt: form.method === "voting" ? fromLocal(form.closesAt) : null,
    announceAt: fromLocal(form.announceAt), sessionId: form.sessionId || null, sort: Number(form.sort) || 0, published: form.published,
  });
  return <form className={css.form} onSubmit={event => { event.preventDefault(); submit(); }}>
    <div className={css.formGrid}>
      <div className="field"><label htmlFor={`${id}-nama`}>Nama kategori</label><input id={`${id}-nama`} className="input" required maxLength={100} value={form.title} onChange={event => set("title", event.target.value)} placeholder="Rekan paling suportif" /></div>
      <div className="field"><label htmlFor={`${id}-cara`}>Cara menentukan</label>
        <select id={`${id}-cara`} className="select" value={form.method} onChange={event => set("method", event.target.value as AwardCategoryInput["method"])}>
          {ADMIN_METHODS.map(method => <option key={method} value={method}>{methodWords[method]}</option>)}
        </select></div>
      <div className="field"><label htmlFor={`${id}-jenis`}>Jenis nominasi</label>
        <select id={`${id}-jenis`} className="select" value={form.nomineeKind} onChange={event => set("nomineeKind", event.target.value as NomineeKind)}>
          {ADMIN_NOMINEE_KINDS.map(kind => <option key={kind} value={kind}>{nomineeKindLabels[kind]}</option>)}
        </select></div>
    </div>
    <div className="field"><label htmlFor={`${id}-tanya`}>Pertanyaan untuk peserta</label><input id={`${id}-tanya`} className="input" maxLength={300} value={form.description} onChange={event => set("description", event.target.value)} placeholder="Siapa yang paling banyak membantu orang lain tahun ini?" /></div>
    <div className={css.formGrid}>
      {form.method === "voting" && <>
        <div className="field"><label htmlFor={`${id}-buka`}>Voting dibuka (WIB)</label><input id={`${id}-buka`} className="input" type="datetime-local" value={form.opensAt} onChange={event => set("opensAt", event.target.value)} /></div>
        <div className="field"><label htmlFor={`${id}-tutup`}>Voting ditutup (WIB)</label><input id={`${id}-tutup`} className="input" type="datetime-local" value={form.closesAt} onChange={event => set("closesAt", event.target.value)} /></div>
      </>}
      <div className="field"><label htmlFor={`${id}-umum`}>Diumumkan (WIB)</label><input id={`${id}-umum`} className="input" type="datetime-local" value={form.announceAt} onChange={event => set("announceAt", event.target.value)} /></div>
      <div className="field"><label htmlFor={`${id}-sesi`}>Sesi</label>
        <select id={`${id}-sesi`} className="select" value={form.sessionId} onChange={event => set("sessionId", event.target.value)}>
          <option value="">Tanpa sesi</option>
          {data.sessions.map(session => <option key={session.id} value={session.id}>{session.title} · {stamp(session.startsAt)}</option>)}
        </select></div>
      <div className="field"><label htmlFor={`${id}-urut`}>Urutan</label><input id={`${id}-urut`} className="input" type="number" min={0} max={999} value={form.sort} onChange={event => set("sort", Number(event.target.value))} /></div>
    </div>
    {category && <label className={css.check}><input type="checkbox" checked={form.published} onChange={event => set("published", event.target.checked)} />Terbit (tampil di aplikasi)</label>}
    {!category && <p className={css.small}>Kategori baru disimpan sebagai draf. Tambahkan nominasinya, lalu terbitkan.</p>}
    <div className={css.actions}>
      <ConsoleButton type="submit" variant="primary" disabled={busy || !form.title.trim()}>{busy ? "Menyimpan…" : "Simpan"}</ConsoleButton>
      <ConsoleButton onClick={onCancel} disabled={busy}>Batal</ConsoleButton>
    </div>
  </form>;
}

type Draft = NomineeInput & { key: string; name: string };

function NomineesForm({ category, data, busy, onSave, onCancel }: { category: MwAwardCategory; data: AdminAwards; busy: boolean; onSave: (nominees: NomineeInput[]) => void; onCancel: () => void }) {
  const id = useId();
  const [list, setList] = useState<Draft[]>(() => category.nominees.map(nominee => ({
    employeeId: nominee.employeeId, photoId: nominee.photoId, label: nominee.label, reason: nominee.reason, key: nominee.id, name: nomineeLabel(category, nominee.id, data),
  })));
  const [typed, setTyped] = useState("");
  const taken = new Set(list.map(item => item.employeeId ?? item.photoId ?? item.label.toLowerCase()));
  const people = data.people.filter(person => !taken.has(person.id)).map(person => ({ ...person, label: `${person.fullName} · ${person.department || "Tanpa departemen"}` }));
  const names = category.nomineeKind === "tim" ? data.groups : data.departments;
  const add = (item: Omit<Draft, "key" | "reason">) => { setList(current => [...current, { ...item, reason: "", key: `baru-${current.length}-${Date.now()}` }]); setTyped(""); };
  const move = (index: number, by: number) => setList(current => { const next = [...current]; const [item] = next.splice(index, 1); next.splice(index + by, 0, item); return next; });
  const picked = people.find(person => person.label === typed);
  return <div className={css.form}>
    {list.length ? <ul className={css.rows} aria-label="Nominasi">
      {list.map((item, index) => <li key={item.key} className={css.row}>
        <span className={css.rowText}>
          <span>{item.name}</span>
          <input className="input" aria-label={`Alasan nominasi ${item.name}`} maxLength={300} placeholder="Alasan (opsional)" value={item.reason} onChange={event => setList(current => current.map(row => (row.key === item.key ? { ...row, reason: event.target.value } : row)))} />
        </span>
        <span className={css.iconButtons}>
          <ConsoleButton aria-label={`Naikkan ${item.name}`} disabled={index === 0} icon={<ArrowUp size={16} aria-hidden />} onClick={() => move(index, -1)} />
          <ConsoleButton aria-label={`Turunkan ${item.name}`} disabled={index === list.length - 1} icon={<ArrowDown size={16} aria-hidden />} onClick={() => move(index, 1)} />
          <ConsoleButton aria-label={`Hapus ${item.name}`} icon={<Trash2 size={16} aria-hidden />} onClick={() => setList(current => current.filter(row => row.key !== item.key))} />
        </span>
      </li>)}
    </ul> : <p className={css.note}>Belum ada nominasi.</p>}
    {category.nomineeKind === "orang" && <div className={css.pick}>
      <div className="field">
        <label htmlFor={`${id}-orang`}>Tambah orang</label>
        <input id={`${id}-orang`} className="input" list={`${id}-daftar`} value={typed} placeholder="Ketik nama karyawan" autoComplete="off" onChange={event => setTyped(event.target.value)} />
        <datalist id={`${id}-daftar`}>{people.map(person => <option key={person.id} value={person.label} />)}</datalist>
      </div>
      <ConsoleButton variant="primary" icon={<Plus size={16} aria-hidden />} disabled={!picked} onClick={() => picked && add({ employeeId: picked.id, photoId: null, label: "", name: picked.label })}>Tambah</ConsoleButton>
    </div>}
    {(category.nomineeKind === "tim" || category.nomineeKind === "departemen") && <div className={css.pick}>
      <div className="field">
        <label htmlFor={`${id}-nama`}>{category.nomineeKind === "tim" ? "Tambah kelompok" : "Tambah departemen"}</label>
        <input id={`${id}-nama`} className="input" list={`${id}-nama-daftar`} value={typed} maxLength={100} autoComplete="off" onChange={event => setTyped(event.target.value)} />
        <datalist id={`${id}-nama-daftar`}>{names.filter(name => !taken.has(name.toLowerCase())).map(name => <option key={name} value={name} />)}</datalist>
      </div>
      <ConsoleButton variant="primary" icon={<Plus size={16} aria-hidden />} disabled={!typed.trim() || taken.has(typed.trim().toLowerCase())} onClick={() => add({ employeeId: null, photoId: null, label: typed.trim(), name: typed.trim() })}>Tambah</ConsoleButton>
    </div>}
    {category.nomineeKind === "foto" && (data.photos.length
      ? <fieldset className={css.photos}><legend className="sr-only">Foto Momen dengan reaksi terbanyak</legend>
        {data.photos.map(photo => {
          const chosen = taken.has(photo.id);
          return <label key={photo.id} className={css.photo}>
            <input type="checkbox" checked={chosen} aria-label={`Foto ${photo.owner}, ${photo.reactions} reaksi`}
              onChange={() => (chosen ? setList(current => current.filter(row => row.photoId !== photo.id)) : add({ employeeId: null, photoId: photo.id, label: "", name: `Foto · ${photo.owner}` }))} />
            {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed storage address */}
            {photo.src ? <img src={photo.src} alt="" loading="lazy" /> : <span className={css.noImage} />}
            <span>{photo.owner} · {photo.reactions} reaksi</span>
          </label>;
        })}
      </fieldset>
      : <p className={css.note}>Belum ada foto Momen yang mendapat reaksi.</p>)}
    <div className={css.actions}>
      <ConsoleButton variant="primary" disabled={busy} onClick={() => onSave(list.map(({ employeeId, photoId, label, reason }) => ({ employeeId, photoId, label, reason })))}>{busy ? "Menyimpan…" : "Simpan nominasi"}</ConsoleButton>
      <ConsoleButton onClick={onCancel} disabled={busy}>Batal</ConsoleButton>
    </div>
  </div>;
}
