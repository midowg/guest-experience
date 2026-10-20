"use client";

import { useMemo, useRef, useState, type FormEvent } from "react";
import { CircleCheck, CircleX, Copy, Eye, EyeOff, FileUp, Link2, MessageCircle, Pencil, RefreshCw, Send, Upload, UserPlus, Users, X } from "lucide-react";
import { Button, Field, Notice } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { localPhone, MAX_COMPANIONS, MAX_IMPORT, parseGuestList, type ParsedGuest } from "@/lib/guest-import";
import { invitationLink, invitationMessage, whatsappUrl, type MessageKind } from "@/lib/invitation-messages";
import { parseContactPhone } from "@/lib/contact-phone";
import type { EventRecord } from "@/lib/types";
import type { EventInvitation } from "@/lib/server/invitations";
import { adminRequest, errorMessage } from "./api";
import styles from "./admin.module.css";

type Filter = "all" | "unsent" | "unopened" | "unanswered" | "yes" | "no" | "revoked";
const filters: { key: Filter; label: string; test: (item: EventInvitation) => boolean }[] = [
  { key: "all", label: "Semua", test: () => true },
  { key: "unsent", label: "Belum dikirim", test: item => item.active && !item.last_sent_at },
  { key: "unopened", label: "Belum dibuka", test: item => item.active && !item.first_opened_at },
  { key: "unanswered", label: "Belum menjawab", test: item => item.active && !item.rsvp },
  { key: "yes", label: "Hadir", test: item => item.rsvp?.attendance === "yes" },
  { key: "no", label: "Tidak hadir", test: item => item.rsvp?.attendance === "no" },
  { key: "revoked", label: "Dicabut", test: item => !item.active },
];
const companionOptions = Array.from({ length: MAX_COMPANIONS + 1 }, (_, n) => n);
type Queue = { kind: MessageKind; ids: string[]; index: number };

/** Guest list, import, WhatsApp sending, and opened/answered status for one event. */
export function InvitationManager({ event, initial, migrated }: { event: EventRecord; initial: EventInvitation[]; migrated: boolean }) {
  const [items, setItems] = useState(initial);
  const [filter, setFilter] = useState<Filter>("all");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [queue, setQueue] = useState<Queue | null>(null);
  const base = `/api/admin/events/${event.id}/invitations`;
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const linkOf = (item: EventInvitation) => invitationLink(origin, event.slug, item.token);
  const textOf = (kind: MessageKind, item: EventInvitation) => invitationMessage(kind, event, item, linkOf(item));

  const counts = useMemo(() => Object.fromEntries(filters.map(f => [f.key, items.filter(f.test).length])) as Record<Filter, number>, [items]);
  const shown = items.filter(filters.find(f => f.key === filter)!.test);
  const active = shown.filter(item => item.active);
  const unanswered = active.filter(item => !item.rsvp);
  const merge = (rows: EventInvitation[]) => setItems(current => current.map(item => rows.find(row => row.id === item.id) ?? item));
  const say = (text: string) => { setMessage(text); setError(""); };

  async function run<T>(work: () => Promise<T>, done?: (result: T) => void) {
    if (busy) return;
    setBusy(true); setError(""); setMessage("");
    try { done?.(await work()); } catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
  }
  async function markSent(ids: string[]) {
    if (!migrated || !ids.length) return;
    try { const result = await adminRequest<EventInvitation[]>(`${base}/sent`, { method: "POST", body: JSON.stringify({ ids }) }); if (result.data) merge(result.data); }
    catch (err) { setError(errorMessage(err)); }
  }
  async function patch(item: EventInvitation, body: object, done: string) {
    await run(() => adminRequest<EventInvitation>(`${base}/${item.id}`, { method: "PATCH", body: JSON.stringify(body) }), result => { if (result.data) merge([result.data]); say(done); setEditing(null); });
  }
  async function copyLinks(rows: EventInvitation[]) {
    try {
      await navigator.clipboard.writeText(rows.map(item => `${item.name}\t${linkOf(item)}`).join("\n"));
      say(rows.length === 1 ? `Tautan ${rows[0].name} disalin.` : `${rows.length} tautan disalin (nama dan tautan, dipisah tab; bisa ditempel ke Excel).`);
    } catch { setError("Tautan tidak dapat disalin otomatis. Periksa izin clipboard browser."); }
  }

  const current = queue ? items.find(item => item.id === queue.ids[queue.index]) : undefined;
  function advance() { setQueue(q => q && q.index + 1 < q.ids.length ? { ...q, index: q.index + 1 } : null); }

  return <div className="stack">
    {!migrated && <Notice tone="warning">Nomor WA, jumlah pendamping, impor massal, dan status terkirim/dibuka menunggu migrasi <code>202610200003_guest_operations.sql</code>. Sampai migrasi diterapkan, Anda tetap bisa menambah tamu satu per satu dan menyalin tautannya.</Notice>}
    {event.invitation_mode !== "personal" && <Notice>Mode acara masih tautan umum. Ubah ke “Tautan per tamu” di editor dan simpan agar tautan individual dapat dibuka.</Notice>}
    <p className={styles.lead}>Tautan pribadi bukan bukti identitas: siapa pun yang memegangnya dapat membuka undangan dan mengubah RSVP. Kirim satu per satu, jangan sebar daftar tautan di grup.</p>

    <div className={styles.guestStats} role="list" aria-label="Ringkasan tamu">
      <span role="listitem"><Users size={16} aria-hidden="true" /> {items.length} tamu</span>
      {migrated && <span role="listitem"><Send size={16} aria-hidden="true" /> {items.length - counts.unsent - counts.revoked} terkirim</span>}
      {migrated && <span role="listitem"><Eye size={16} aria-hidden="true" /> {items.filter(item => item.first_opened_at).length} dibuka</span>}
      <span role="listitem"><CircleCheck size={16} aria-hidden="true" /> {counts.yes} hadir · {counts.no} tidak</span>
    </div>

    {error && <Notice tone="error" role="alert">{error}</Notice>}
    {message && <p role="status" className={styles.guestMessage}>{message}</p>}

    <AddGuest disabled={busy || items.length >= 1000} migrated={migrated} onAdd={(body, reset) => run(() => adminRequest<EventInvitation>(base, { method: "POST", body: JSON.stringify(body) }), result => { if (result.data) setItems(list => [...list, result.data!]); reset(); say(`Undangan untuk ${body.name} dibuat.`); })} />
    {migrated && <ImportGuests existing={items} disabled={busy} remaining={1000 - items.length} onImport={(rows, reset) => run(() => adminRequest<EventInvitation[]>(base, { method: "POST", body: JSON.stringify({ rows }) }), result => { setItems(list => [...list, ...(result.data ?? [])]); reset(); say(`${result.data?.length ?? 0} tamu diimpor.`); })} />}

    {queue && <div className={styles.sendQueue} role="region" aria-label="Kirim WhatsApp berurutan">
      {current ? <>
        <p><strong>{queue.kind === "invite" ? "Kirim undangan" : "Kirim pengingat"}</strong> · {queue.index + 1} dari {queue.ids.length}</p>
        <p className={styles.sendQueueName}>{current.name}{current.phone ? ` · ${localPhone(current.phone)}` : " · tanpa nomor (pilih kontak di WhatsApp)"}</p>
        <div className={styles.actions}>
          <a className="button button--primary" href={whatsappUrl(current.phone, textOf(queue.kind, current))} target="_blank" rel="noopener noreferrer" onClick={() => { void markSent([current.id]); advance(); }}><MessageCircle size={17} aria-hidden="true" /> Buka WhatsApp<span className="sr-only"> (tab baru)</span></a>
          <Button type="button" variant="secondary" onClick={advance}>Lewati</Button>
          <Button type="button" variant="quiet" onClick={() => setQueue(null)}><X size={16} aria-hidden="true" /> Selesai</Button>
        </div>
        <p className="field-hint">Setiap klik membuka obrolan dengan pesan terisi; tekan Kirim di WhatsApp, lalu kembali ke sini untuk tamu berikutnya.</p>
      </> : <p>Antrean selesai.</p>}
    </div>}

    <nav className={styles.filterChips} aria-label="Saring tamu">
      {filters.filter(f => migrated || !["unsent", "unopened"].includes(f.key)).map(f => <button key={f.key} type="button" aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}>{f.label} <span>{counts[f.key]}</span></button>)}
    </nav>
    {active.length > 0 && <div className={styles.actions}>
      <Button type="button" variant="secondary" onClick={() => copyLinks(active)}><Copy size={16} aria-hidden="true" /> Salin {active.length} tautan</Button>
      <Button type="button" variant="secondary" onClick={() => setQueue({ kind: "invite", ids: active.map(item => item.id), index: 0 })}><MessageCircle size={16} aria-hidden="true" /> Kirim undangan via WhatsApp ({active.length})</Button>
      {unanswered.length > 0 && <Button type="button" variant="secondary" onClick={() => setQueue({ kind: "reminder", ids: unanswered.map(item => item.id), index: 0 })}><Send size={16} aria-hidden="true" /> Kirim pengingat ({unanswered.length} belum menjawab)</Button>}
    </div>}

    {shown.length === 0 ? <p className="muted">{items.length ? "Tidak ada tamu untuk saringan ini." : "Belum ada tamu. Tambahkan satu per satu atau impor dari Excel."}</p>
      : <ul className={styles.guestList}>{shown.map(item => <li key={item.id} className={styles.guestItem}>
        {editing === item.id ? <EditGuest item={item} migrated={migrated} disabled={busy} onCancel={() => setEditing(null)} onSave={body => patch(item, migrated ? { action: "update", ...body } : { action: "rename", name: body.name }, "Data tamu diperbarui.")} />
          : <>
            <div className={styles.guestHead}>
              <strong>{item.name}</strong>
              {migrated && item.party_size_max > 1 && <span className={styles.guestBadge}>+{item.party_size_max - 1} pendamping</span>}
              {!item.active && <span className={`${styles.guestBadge} ${styles.badgeMuted}`}>Tautan dicabut</span>}
            </div>
            <p className={styles.guestMeta}>
              {item.phone ? localPhone(item.phone) : migrated ? "Tanpa nomor WA" : ""}
              {migrated && <> · {item.last_sent_at ? `Dikirim ${formatDateTime(item.last_sent_at)}${item.send_count > 1 ? ` (${item.send_count}×)` : ""}` : "Belum dikirim"}</>}
            </p>
            <p className={styles.guestStatus}>
              {migrated && (item.first_opened_at ? <span><Eye size={14} aria-hidden="true" /> Dibuka {item.open_count}× · terakhir {formatDateTime(item.last_opened_at!)}</span> : <span className={styles.statusQuiet}><EyeOff size={14} aria-hidden="true" /> Belum dibuka</span>)}
              {item.rsvp ? <span className={item.rsvp.attendance === "yes" ? styles.statusYes : styles.statusNo}>{item.rsvp.attendance === "yes" ? <CircleCheck size={14} aria-hidden="true" /> : <CircleX size={14} aria-hidden="true" />} {item.rsvp.attendance === "yes" ? "Hadir" : "Tidak hadir"}</span> : <span className={styles.statusQuiet}>Belum menjawab</span>}
            </p>
            <div className={styles.guestActions}>
              {item.active && <a className="button button--secondary" href={whatsappUrl(item.phone, textOf(item.rsvp ? "invite" : item.last_sent_at ? "reminder" : "invite", item))} target="_blank" rel="noopener noreferrer" onClick={() => void markSent([item.id])}><MessageCircle size={16} aria-hidden="true" /> {item.last_sent_at && !item.rsvp ? "Ingatkan" : "Kirim WA"}<span className="sr-only"> ke {item.name} (tab baru)</span></a>}
              {item.active && <Button type="button" variant="secondary" onClick={() => copyLinks([item])}><Link2 size={16} aria-hidden="true" /> Salin tautan</Button>}
              <Button type="button" variant="quiet" disabled={busy} onClick={() => setEditing(item.id)}><Pencil size={16} aria-hidden="true" /> Ubah<span className="sr-only"> {item.name}</span></Button>
              <Button type="button" variant="quiet" disabled={busy} onClick={() => window.confirm("Terbitkan tautan baru? Tautan lama langsung tidak berlaku; RSVP tersimpan tetap ada.") && patch(item, { action: "rotate" }, "Tautan baru diterbitkan.")}><RefreshCw size={16} aria-hidden="true" /> Tautan baru</Button>
              {item.active && <Button type="button" variant="danger" disabled={busy} onClick={() => window.confirm("Cabut tautan ini? Tamu tidak dapat membuka halaman atau memperbarui RSVP melalui tautan lama.") && patch(item, { action: "revoke" }, "Tautan dicabut.")}>Cabut</Button>}
            </div>
          </>}
      </li>)}</ul>}
  </div>;
}

type GuestBody = { name: string; phone: string | null; party_size_max: number };
function guestFields(prefix: string, values: { name: string; phone: string; companions: number }, set: (patch: Partial<{ name: string; phone: string; companions: number }>) => void, migrated: boolean, phoneError: string) {
  return <div className={styles.guestFields}>
    <Field name={`${prefix}-name`} label="Nama sapaan"><input id={`${prefix}-name`} className="input" value={values.name} onChange={e => set({ name: e.target.value })} maxLength={150} required placeholder="Contoh: Ibu Sari Wulandari" /></Field>
    {migrated && <Field name={`${prefix}-phone`} label="Nomor WA (opsional)" error={phoneError}><input id={`${prefix}-phone`} className="input" inputMode="tel" value={values.phone} onChange={e => set({ phone: e.target.value })} placeholder="Contoh: 0812 3456 7890" aria-invalid={!!phoneError} /></Field>}
    {migrated && <Field name={`${prefix}-companions`} label="Pendamping"><select id={`${prefix}-companions`} className="input" value={values.companions} onChange={e => set({ companions: Number(e.target.value) })}>{companionOptions.map(n => <option key={n} value={n}>{n === 0 ? "Tanpa pendamping" : `${n} orang`}</option>)}</select></Field>}
  </div>;
}
function toBody(values: { name: string; phone: string; companions: number }): GuestBody | string {
  const phone = values.phone.trim() ? parseContactPhone(values.phone) : null;
  if (values.phone.trim() && !phone) return "Gunakan nomor HP Indonesia, misalnya 0812 3456 7890.";
  return { name: values.name.trim(), phone: phone?.international ?? null, party_size_max: values.companions + 1 };
}

function AddGuest({ disabled, migrated, onAdd }: { disabled: boolean; migrated: boolean; onAdd: (body: GuestBody, reset: () => void) => void }) {
  const empty = { name: "", phone: "", companions: 0 };
  const [values, setValues] = useState(empty);
  const [phoneError, setPhoneError] = useState("");
  function submit(e: FormEvent) {
    e.preventDefault();
    const body = toBody(values);
    if (typeof body === "string") { setPhoneError(body); return; }
    if (!body.name) return;
    onAdd(body, () => setValues(empty));
  }
  return <form onSubmit={submit} className={styles.guestCard} aria-labelledby="add-guest-title">
    <h2 id="add-guest-title" className={styles.guestCardTitle}><UserPlus size={18} aria-hidden="true" /> Tambah tamu</h2>
    {guestFields("add", values, patch => { setValues(v => ({ ...v, ...patch })); setPhoneError(""); }, migrated, phoneError)}
    <Button type="submit" disabled={disabled || !values.name.trim()}>Tambah</Button>
  </form>;
}

function EditGuest({ item, migrated, disabled, onCancel, onSave }: { item: EventInvitation; migrated: boolean; disabled: boolean; onCancel: () => void; onSave: (body: GuestBody) => void }) {
  const [values, setValues] = useState({ name: item.name, phone: localPhone(item.phone), companions: item.party_size_max - 1 });
  const [phoneError, setPhoneError] = useState("");
  function submit(e: FormEvent) {
    e.preventDefault();
    const body = toBody(values);
    if (typeof body === "string") { setPhoneError(body); return; }
    if (body.name) onSave(body);
  }
  return <form onSubmit={submit} className="stack" aria-label={`Ubah ${item.name}`}>
    {guestFields(`edit-${item.id}`, values, patch => { setValues(v => ({ ...v, ...patch })); setPhoneError(""); }, migrated, phoneError)}
    <div className={styles.actions}><Button type="submit" disabled={disabled}>Simpan</Button><Button type="button" variant="quiet" onClick={onCancel}>Batal</Button></div>
  </form>;
}

function ImportGuests({ existing, disabled, remaining, onImport }: { existing: EventInvitation[]; disabled: boolean; remaining: number; onImport: (rows: GuestBody[], reset: () => void) => void }) {
  const [text, setText] = useState("");
  const [rows, setRows] = useState<ParsedGuest[] | null>(null);
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const file = useRef<HTMLInputElement>(null);
  const check = (value: string) => setRows(value.trim() ? parseGuestList(value, existing) : null);
  async function readFile(input: HTMLInputElement) {
    const chosen = input.files?.[0];
    if (!chosen) return;
    const content = await chosen.text();
    setText(content); check(content);
  }
  const ready = (rows ?? []).filter(row => !row.errors.length && !(skipDuplicates && row.duplicate));
  const bad = (rows ?? []).filter(row => row.errors.length).length;
  const duplicates = (rows ?? []).filter(row => !row.errors.length && row.duplicate).length;
  const limit = Math.min(MAX_IMPORT, remaining);
  return <details className={styles.guestCard}>
    <summary className={styles.guestCardTitle}><Upload size={18} aria-hidden="true" /> Impor dari Excel / Google Sheets / CSV</summary>
    <div className="stack">
      <p className="field-hint">Salin kolom <strong>Nama</strong>, <strong>Nomor WA</strong>, dan <strong>Pendamping</strong> (angka 0–{MAX_COMPANIONS}) dari spreadsheet, lalu tempel di sini. Baris judul kolom boleh ikut; tanpa judul, urutannya nama, nomor, pendamping. Maksimal {MAX_IMPORT} baris sekali impor.</p>
      <Field name="import-text" label="Tempel daftar tamu"><textarea id="import-text" className="textarea" rows={6} value={text} onChange={e => { setText(e.target.value); check(e.target.value); }} placeholder={"Nama\tNomor WA\tPendamping\nIbu Sari Wulandari\t0812 3456 7890\t1\nBapak Budi Santoso\t0813 1111 2222\t0"} /></Field>
      <div className={styles.actions}>
        <input ref={file} type="file" accept=".csv,.tsv,.txt,text/csv,text/plain" className="sr-only" id="import-file" onChange={e => void readFile(e.currentTarget)} />
        <Button type="button" variant="secondary" onClick={() => file.current?.click()}><FileUp size={16} aria-hidden="true" /> Pilih berkas CSV</Button>
        <span className="field-hint">Dari Excel: Simpan sebagai → CSV (UTF-8).</span>
      </div>
      {rows && <>
        <p role="status"><strong>{ready.length}</strong> siap diimpor{bad ? ` · ${bad} baris perlu diperbaiki` : ""}{duplicates ? ` · ${duplicates} kemungkinan duplikat` : ""}</p>
        {duplicates > 0 && <label className={styles.inlineCheck}><input type="checkbox" checked={skipDuplicates} onChange={e => setSkipDuplicates(e.target.checked)} /> Lewati kemungkinan duplikat</label>}
        <div className={styles.importTableWrap}><table className={styles.importTable}>
          <thead><tr><th scope="col">Baris</th><th scope="col">Nama</th><th scope="col">Nomor WA</th><th scope="col">Pendamping</th><th scope="col">Status</th></tr></thead>
          <tbody>{rows.slice(0, 200).map(row => <tr key={row.line} className={row.errors.length ? styles.rowBad : row.duplicate ? styles.rowWarn : undefined}>
            <td>{row.line}</td><td>{row.name || "—"}</td><td>{localPhone(row.phone) || "—"}</td><td>{row.party_size_max - 1}</td>
            <td>{row.errors.length ? row.errors.join(" ") : row.duplicate ?? "Siap"}</td>
          </tr>)}</tbody>
        </table></div>
        {rows.length > 200 && <p className="field-hint">Menampilkan 200 baris pertama dari {rows.length}.</p>}
        {ready.length > limit && <Notice tone="warning">Hanya {limit} tamu yang dapat diimpor sekarang (maksimal {MAX_IMPORT} per impor, 1000 per acara).</Notice>}
        <Button type="button" disabled={disabled || !ready.length || ready.length > limit} onClick={() => onImport(ready.map(({ name, phone, party_size_max }) => ({ name, phone, party_size_max })), () => { setText(""); setRows(null); })}>Impor {ready.length} tamu</Button>
      </>}
    </div>
  </details>;
}
