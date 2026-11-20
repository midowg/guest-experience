"use client";

import { useId, useMemo, useState } from "react";
import { ConsoleButton } from "@/components/console";
import { sessionKindLabels, sessionModuleLabels, sessionStatusLabels } from "@/lib/main-wam/admin/labels";
import type { AdminPerson } from "@/lib/main-wam/admin/people";
import {
  blankSession, inputTimes, lineupFromText, lineupToText, minutesLabel, scheduleChanges, sessionInputSchema, sessionToInput, shifted, type SessionInput,
} from "@/lib/main-wam/admin/rundown";
import { timeRange, wibDate, wibTime } from "@/lib/main-wam/rundown";
import { SESSION_KINDS, SESSION_MODULES, SESSION_STATUSES, type MwSession, type RundownChange, type SessionModule } from "@/lib/main-wam/types";
import { Choice, DaySelect, described, Field, NumberInput, PersonSelect, SwitchRow, dayOptionLabel, type Problems } from "./fields";
import { Sheet } from "./Sheet";
import css from "./isi.module.css";

export type GuideOption = { id: string; title: string; kind: string };

const dot = (time: string) => time.replace(":", ".");
const fieldLabels: Record<RundownChange["changes"][number]["field"], string> = { startsAt: "Mulai", endsAt: "Selesai", place: "Tempat", status: "Status" };
function changeValue(field: RundownChange["changes"][number]["field"], value: string | null): string {
  if (value === null) return "kosong";
  if (field === "startsAt" || field === "endsAt") return dot(wibTime(value));
  if (field === "status") return sessionStatusLabels[value as keyof typeof sessionStatusLabels] ?? value;
  return value;
}
const when = (iso: string) => new Intl.DateTimeFormat("id-ID", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(new Date(iso)).replace(":", ".");

/**
 * Tambah sesi / Ubah sesi: one sheet, one Simpan; "Kabari peserta" when a published session's time,
 * place or status changes. `cancel`: opened from "Batalkan sesi" (a session that cannot be deleted),
 * with the status already Batal.
 */
export function SessionSheet({ session, cancel = false, dates, date, people, guides, names, log, busy, nextSort, onClose, onSave }: {
  session: MwSession | null; cancel?: boolean; dates: readonly string[]; date: string; people: readonly AdminPerson[]; guides: readonly GuideOption[]; names: Map<string, string>;
  log: readonly RundownChange[]; busy: boolean; nextSort: number;
  onClose: () => void; onSave: (input: SessionInput, notify: boolean, changes: RundownChange["changes"]) => Promise<boolean>;
}) {
  const id = useId();
  const [draft, setDraft] = useState<SessionInput>(() => (session ? { ...sessionToInput(session), ...(cancel ? { status: "batal" as const } : {}) } : blankSession(date, nextSort)));
  const [lineup, setLineup] = useState(() => lineupToText(draft.lineup));
  const [problems, setProblems] = useState<Problems>({});
  const [notify, setNotify] = useState(true);
  const set = (patch: Partial<SessionInput>) => { setDraft(current => ({ ...current, ...patch })); setProblems({}); };
  const changes = useMemo(() => {
    if (!session || !draft.date || !draft.start) return [];
    try { const times = inputTimes(draft); return scheduleChanges(session, { ...times, place: draft.place.trim(), status: draft.status }); } catch { return []; }
  }, [session, draft]);
  const seen = !!session && session.status !== "draf";

  function submit() {
    const input = { ...draft, lineup: lineupFromText(lineup) };
    const checked = sessionInputSchema.safeParse(input);
    if (!checked.success) {
      const found: Problems = {};
      for (const issue of checked.error.issues) found[String(issue.path[0] ?? "form")] ??= issue.message;
      setProblems(found);
      return;
    }
    void onSave(checked.data, seen && notify && changes.length > 0, changes);
  }
  const text = (key: "title" | "place" | "dresscode" | "meal", label: string, max: number, extra: { optional?: boolean; hint?: string; placeholder?: string } = {}) =>
    <Field id={`${id}-${key}`} label={label} optional={extra.optional} hint={extra.hint} error={problems[key]}>
      <input className="input" {...described(`${id}-${key}`, problems[key], !!extra.hint)} value={draft[key]} maxLength={max} placeholder={extra.placeholder} onChange={event => set({ [key]: event.target.value } as Partial<SessionInput>)} />
    </Field>;
  const denah = guides.filter(guide => guide.kind === "denah");

  return <Sheet title={cancel ? "Batalkan sesi" : session ? "Ubah sesi" : "Tambah sesi"} subtitle={session ? session.title : "Sesi baru tersimpan sebagai draf sampai statusnya Terbit."} busy={busy} onClose={onClose} onSubmit={submit}
    footer={<>
      <ConsoleButton disabled={busy} onClick={onClose}>Batal</ConsoleButton>
      <ConsoleButton type="submit" variant="primary" disabled={busy}>{busy ? "Menyimpan…" : session ? "Simpan" : "Tambah sesi"}</ConsoleButton>
    </>}>
    <fieldset className={css.group}>
      <legend>Sesi</legend>
      {text("title", "Judul", 150, { placeholder: "mis. Pemaparan departemen" })}
      <Choice label="Jenis" name={`${id}-kind`} value={draft.kind} onChange={kind => set({ kind, ...(kind === "makan" ? { usesAttendance: false, required: false } : {}) })}
        options={SESSION_KINDS.map(value => ({ value, label: sessionKindLabels[value] }))} />
      <div className={css.trio}>
        <Field id={`${id}-date`} label="Hari" error={problems.date}><DaySelect id={`${id}-date`} dates={dates} value={draft.date} onChange={value => set({ date: value ?? "" })} error={problems.date} /></Field>
        <Field id={`${id}-start`} label="Mulai" error={problems.start}>
          <input className="input" type="time" step={300} {...described(`${id}-start`, problems.start)} value={draft.start} onChange={event => set({ start: event.target.value })} />
        </Field>
        <Field id={`${id}-end`} label="Selesai" optional hint="Kosong: 30 menit." error={problems.end}>
          <input className="input" type="time" step={300} {...described(`${id}-end`, problems.end, true)} value={draft.end ?? ""} onChange={event => set({ end: event.target.value || null })} />
        </Field>
      </div>
      <Choice label="Status" name={`${id}-status`} value={draft.status} onChange={status => set({ status })}
        options={SESSION_STATUSES.map(value => ({ value, label: sessionStatusLabels[value] }))} />
      <p className={css.hint}>Draf hanya terlihat di sini. Terbit tampil di Agenda peserta dan jadi tag foto Momen. Batal tetap tampil, dicoret.</p>
    </fieldset>

    <fieldset className={css.group}>
      <legend>Tempat</legend>
      <div className={css.pair}>
        {text("place", "Tempat", 200, { optional: true, placeholder: "mis. Aula Utama · lantai 1" })}
        <Field id={`${id}-map`} label="Denah" optional hint={denah.length ? "Tombol Denah di detail sesi." : "Tambah panduan jenis Denah dulu di Panduan."} error={problems.mapGuideId}>
          <select className="select" {...described(`${id}-map`, problems.mapGuideId, true)} value={draft.mapGuideId ?? ""} onChange={event => set({ mapGuideId: event.target.value || null })}>
            <option value="">Tanpa denah</option>
            {(denah.length ? denah : guides).map(guide => <option key={guide.id} value={guide.id}>{guide.title}</option>)}
          </select>
        </Field>
      </div>
    </fieldset>

    <fieldset className={css.group}>
      <legend>Untuk peserta</legend>
      <div className={css.pair}>
        {text("dresscode", "Dresscode", 200, { optional: true, placeholder: "mis. Kaos WAM" })}
        {text("meal", "Konsumsi", 300, { optional: true, placeholder: "mis. 10.00 Rehat · kopi, teh" })}
      </div>
      <Field id={`${id}-bring`} label="Yang perlu dibawa" optional error={problems.bring}>
        <textarea className="textarea" {...described(`${id}-bring`, problems.bring)} value={draft.bring} maxLength={500} rows={2} placeholder="mis. KTP, laptop dan charger" onChange={event => set({ bring: event.target.value })} />
      </Field>
      <Field id={`${id}-lineup`} label="Urutan tampil" optional hint="Satu baris satu giliran: 08.00 Sales & Marketing" error={problems.lineup}>
        <textarea className="textarea" {...described(`${id}-lineup`, problems.lineup, true)} value={lineup} rows={3} onChange={event => { setLineup(event.target.value); setProblems({}); }} />
      </Field>
      <Field id={`${id}-description`} label="Keterangan" optional error={problems.description}>
        <textarea className="textarea" {...described(`${id}-description`, problems.description)} value={draft.description} maxLength={2000} rows={2} onChange={event => set({ description: event.target.value })} />
      </Field>
      <Field id={`${id}-contact`} label="Kontak panitia" optional hint="Tombol Hubungi di detail sesi." error={problems.contactId}>
        <PersonSelect id={`${id}-contact`} people={people} value={draft.contactId} onChange={contactId => set({ contactId })} error={problems.contactId} />
      </Field>
    </fieldset>

    <fieldset className={css.group}>
      <legend>Absen dan modul</legend>
      <div className={css.switches}>
        <SwitchRow title="Pakai absen" sub={draft.kind === "makan" ? "Sesi makan tanpa absen." : "Peserta scan QR sesi ini."} checked={draft.usesAttendance} disabled={draft.kind === "makan"}
          onChange={usesAttendance => set({ usesAttendance, ...(usesAttendance ? {} : { required: false }) })} />
        <SwitchRow title="Wajib hadir" sub="Panitia melihat siapa yang belum absen." checked={draft.required} disabled={draft.kind === "makan"}
          onChange={required => set({ required, ...(required ? { usesAttendance: true, optional: false } : {}) })} />
        <SwitchRow title="Opsional" sub="Tanda Opsional di Agenda." checked={draft.optional} disabled={draft.required} onChange={optional => set({ optional })} />
      </div>
      {(problems.usesAttendance || problems.required || problems.optional) && <p className={css.error}>{problems.usesAttendance ?? problems.required ?? problems.optional}</p>}
      <div className={css.pair}>
        <Field id={`${id}-module`} label="Modul" hint="Aksinya muncul di detail sesi bila modulnya menyala." error={problems.module}>
          <select className="select" {...described(`${id}-module`, problems.module, true)} value={draft.module ?? ""} onChange={event => set({ module: (event.target.value || null) as SessionModule | null })}>
            <option value="">{sessionModuleLabels.none}</option>
            {SESSION_MODULES.map(value => <option key={value} value={value}>{sessionModuleLabels[value]}</option>)}
          </select>
        </Field>
        <Field id={`${id}-sort`} label="Urutan" hint="Untuk sesi yang mulai bersamaan." error={problems.sort}>
          <NumberInput id={`${id}-sort`} integer value={draft.sort} onChange={value => set({ sort: value ?? 0 })} error={problems.sort} />
        </Field>
      </div>
    </fieldset>

    {seen && changes.length > 0 && <fieldset className={css.group}>
      <legend>Perubahan jadwal</legend>
      <p className={css.note}>{changes.map(change => `${fieldLabels[change.field]}: ${changeValue(change.field, change.from)} jadi ${changeValue(change.field, change.to)}`).join(" · ")}. Tercatat di riwayat dengan nama Anda.</p>
      <SwitchRow title="Kabari peserta" sub="Notifikasi ke semua peserta WAM 2026." checked={notify} onChange={setNotify} />
    </fieldset>}

    {log.length > 0 && <section className={css.group} aria-labelledby={`${id}-history`}>
      <h3 id={`${id}-history`} className={css.label}>Riwayat perubahan</h3>
      <ul className={css.history}>{log.slice(0, 8).map(entry => <li key={entry.id}>
        <span>{entry.changes.map(change => `${fieldLabels[change.field]} ${changeValue(change.field, change.from)} jadi ${changeValue(change.field, change.to)}`).join(" · ")}</span>
        <small>diubah {entry.changedBy ? names.get(entry.changedBy) ?? "admin" : "admin"} · {when(entry.changedAt)}{entry.notified ? ` · dikabarkan ke ${entry.recipients.toLocaleString("id-ID")} orang` : ""}</small>
      </li>)}</ul>
    </section>}
  </Sheet>;
}

const QUICK = [-60, -30, -15, 15, 30, 60];

/** Geser jam: several sessions of one day earlier or later by the same minutes, told once. */
export function ShiftSheet({ sessions, dayLabel, busy, onClose, onSave }: {
  sessions: readonly MwSession[]; dayLabel: string; busy: boolean; onClose: () => void; onSave: (ids: string[], minutes: number, notify: boolean) => void;
}) {
  const id = useId();
  const [picked, setPicked] = useState<string[]>([]);
  const [minutes, setMinutes] = useState<number | null>(30);
  const [notify, setNotify] = useState(true);
  const [problem, setProblem] = useState("");
  const chosen = new Set(picked);
  const published = sessions.filter(session => chosen.has(session.id) && session.status === "terbit").length;
  const toggle = (sessionId: string) => { setPicked(chosen.has(sessionId) ? picked.filter(item => item !== sessionId) : [...picked, sessionId]); setProblem(""); };
  const fromHere = (index: number) => { setPicked(sessions.slice(index).map(session => session.id)); setProblem(""); };
  function submit() {
    if (!picked.length) { setProblem("Pilih sesi yang digeser."); return; }
    if (!minutes || minutes % 5 !== 0 || Math.abs(minutes) > 720) { setProblem("Geser dalam kelipatan 5 menit, paling jauh 12 jam."); return; }
    onSave(picked, minutes, notify && published > 0);
  }
  return <Sheet title="Geser jam" subtitle={dayLabel} busy={busy} onClose={onClose} onSubmit={submit}
    footer={<>
      <ConsoleButton disabled={busy} onClick={onClose}>Batal</ConsoleButton>
      <ConsoleButton type="submit" variant="primary" disabled={busy || !picked.length}>{busy ? "Menyimpan…" : picked.length ? `Geser ${picked.length} sesi` : "Geser"}</ConsoleButton>
    </>}>
    <div className={css.field}>
      <span className={css.label} id={`${id}-by`}>Geser</span>
      <div className={css.segmentedField} role="group" aria-labelledby={`${id}-by`}>
        {QUICK.map(value => <button key={value} type="button" className={css.segment} aria-pressed={minutes === value} onClick={() => setMinutes(value)}>{minutesLabel(value)}</button>)}
      </div>
    </div>
    <Field id={`${id}-minutes`} label="Atau tulis menit" hint="Minus untuk lebih awal, misalnya -15.">
      <NumberInput id={`${id}-minutes`} integer value={minutes} onChange={setMinutes} suffix="menit" />
    </Field>
    <div className={css.picker} role="group" aria-labelledby={`${id}-sessions`}>
      <div className={css.sectionHead}>
        <span className={css.label} id={`${id}-sessions`}>Sesi <span className={css.optional}>({picked.length} dipilih)</span></span>
        <span className={css.toolbarGroup}>
          <button type="button" className={css.textButton} onClick={() => setPicked(sessions.map(session => session.id))}>Semua</button>
          <button type="button" className={css.textButton} onClick={() => setPicked([])} disabled={!picked.length}>Kosongkan</button>
        </span>
      </div>
      <ul className={css.pickerList}>
        {sessions.map((session, index) => {
          const moved = minutes && chosen.has(session.id) ? shifted(session, minutes) : null;
          return <li key={session.id}>
            <div className={css.pick}>
              <input type="checkbox" id={`${id}-s${index}`} checked={chosen.has(session.id)} onChange={() => toggle(session.id)} />
              <label htmlFor={`${id}-s${index}`}><strong>{session.title}</strong><small>{moved ? `${timeRange(moved)} · tadinya ${timeRange(session)}` : timeRange(session)}{session.status !== "terbit" ? ` · ${sessionStatusLabels[session.status]}` : ""}</small></label>
              <button type="button" className={css.textButton} onClick={() => fromHere(index)} aria-label={`Pilih ${session.title} dan sesudahnya`}>Dari sini</button>
            </div>
          </li>;
        })}
      </ul>
    </div>
    {problem && <p className={css.error} role="alert">{problem}</p>}
    {published > 0 && <SwitchRow title="Kabari peserta" sub={`${published} sesi terbit ikut bergeser. Satu notifikasi ke semua peserta.`} checked={notify} onChange={setNotify} />}
  </Sheet>;
}

/** Salin sesi: a draft copy on a day (the same by default). */
export function CopySheet({ session, dates, busy, onClose, onSave }: { session: MwSession; dates: readonly string[]; busy: boolean; onClose: () => void; onSave: (date: string) => void }) {
  const id = useId();
  const [date, setDate] = useState<string>(() => (dates.includes(wibDate(session.startsAt)) ? wibDate(session.startsAt) : dates[0]));
  return <Sheet title="Salin sesi" subtitle={`${session.title} · ${timeRange(session)}`} busy={busy} onClose={onClose} onSubmit={() => onSave(date)}
    footer={<>
      <ConsoleButton disabled={busy} onClick={onClose}>Batal</ConsoleButton>
      <ConsoleButton type="submit" variant="primary" disabled={busy}>{busy ? "Menyalin…" : "Salin"}</ConsoleButton>
    </>}>
    <Field id={`${id}-date`} label="Ke hari" hint="Jam, tempat, dan isinya sama. Salinannya draf.">
      <DaySelect id={`${id}-date`} dates={dates} value={date} onChange={value => value && setDate(value)} />
    </Field>
    <p className={css.note}>Jadi: {dayOptionLabel(dates, date)}, {timeRange(session)}.</p>
  </Sheet>;
}
