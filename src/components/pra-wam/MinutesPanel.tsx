"use client";

import { useId, useState } from "react";
import { CheckCircle2, NotebookPen, Plus, Trash2 } from "lucide-react";
import { Notice } from "@/components/ui";
import { dayLabel } from "@/lib/pra-wam/appraisal";
import { minutesApi, minutesLimits, minutesStatusLabels, type MinuteAction, type MinutesView } from "@/lib/pra-wam/minutes";
import { errorText, praWamRequest } from "./api";
import styles from "./pra-wam.module.css";
import css from "./minutes.module.css";

type Draft = { summary: string; decisions: string; actions: MinuteAction[] };
const stamp = (iso: string) => new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(new Date(iso)).replace(":", ".");
const blankAction = (): MinuteAction => ({ task: "", picId: null, dueDate: null, done: false });

/**
 * Notulen (MoM) in Detail sesi (11 Nov 2026): what was summed up and decided, and the follow-ups
 * with their PIC and due date. Anyone in the meeting writes it once it has started (whoever saves
 * is its notetaker); the PIC or anyone in it ticks a follow-up done. Panitia, BOD and the HOD/Lead
 * of the booker's department read it.
 */
export function MinutesPanel({ sessionId, initial }: { sessionId: string; initial: MinutesView }) {
  const uid = useId();
  const [view, setView] = useState(initial);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const { minutes, status, canWrite, people } = view;

  function start() {
    setNotice(null); setError(null);
    setDraft(minutes ? { summary: minutes.summary, decisions: minutes.decisions, actions: minutes.actions.map(action => ({ ...action })) } : { summary: "", decisions: "", actions: [] });
  }
  const setAction = (index: number, patch: Partial<MinuteAction>) => setDraft(current => current && { ...current, actions: current.actions.map((action, at) => at === index ? { ...action, ...patch } : action) });

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!draft) return;
    setBusy(true); setError(null);
    try {
      const actions = draft.actions.filter(action => action.task.trim()).map(({ task, picId, dueDate, done }) => ({ task: task.trim(), picId, dueDate, done }));
      const result = await praWamRequest<MinutesView>(minutesApi.session(sessionId), { method: "PUT", json: { summary: draft.summary, decisions: draft.decisions, actions } });
      setView(result.data); setDraft(null); setNotice(result.message);
    } catch (problem) { setError(errorText(problem)); }
    finally { setBusy(false); }
  }

  async function tick(action: MinuteAction, done: boolean) {
    if (!action.id) return;
    setError(null);
    try {
      const result = await praWamRequest<MinuteAction>(minutesApi.action(sessionId, action.id), { method: "PATCH", json: { done } });
      setView(current => current.minutes ? { ...current, minutes: { ...current.minutes, actions: current.minutes.actions.map(item => item.id === action.id ? result.data : item) } } : current);
    } catch (problem) { setError(errorText(problem)); }
  }

  const heading = <div className={css.head}>
    <p className={css.title}><NotebookPen size={18} aria-hidden /> Notulen (MoM)</p>
    {view.migrated && <span className={`${styles.pill} ${status === "belum" ? styles.pillBrass : styles.pillLine}`}>{minutesStatusLabels[status]}</span>}
  </div>;

  if (!view.migrated) return <section className={css.panel} aria-label="Notulen">{heading}<p className={styles.hint}>Notulen bisa ditulis setelah pembaruan sistem selesai.</p></section>;

  if (draft) return <section className={css.panel} aria-label="Notulen">
    {heading}
    <form className={css.form} onSubmit={save}>
      <div>
        <label className={styles.label} htmlFor={`${uid}-summary`}>Ringkasan</label>
        <textarea id={`${uid}-summary`} className="textarea" rows={4} maxLength={minutesLimits.text} value={draft.summary} placeholder="Apa yang dibahas"
          onChange={event => setDraft({ ...draft, summary: event.target.value })} />
      </div>
      <div>
        <label className={styles.label} htmlFor={`${uid}-decisions`}>Keputusan</label>
        <textarea id={`${uid}-decisions`} className="textarea" rows={3} maxLength={minutesLimits.text} value={draft.decisions} placeholder="Yang disepakati, satu per baris"
          onChange={event => setDraft({ ...draft, decisions: event.target.value })} />
      </div>
      <fieldset className={css.actionsField}>
        <legend className={styles.label}>Tindak lanjut</legend>
        {draft.actions.length === 0 && <p className={styles.hint}>Belum ada. Tambahkan tugas dengan PIC dan tenggatnya.</p>}
        <ol className={css.actionRows}>{draft.actions.map((action, index) => <li key={index} className={css.actionRow}>
          <input className="input" aria-label={`Tugas ${index + 1}`} value={action.task} maxLength={minutesLimits.task} placeholder="Tugas"
            onChange={event => setAction(index, { task: event.target.value })} />
          <select className="select" aria-label={`PIC tugas ${index + 1}`} value={action.picId ?? ""} onChange={event => setAction(index, { picId: event.target.value || null })}>
            <option value="">PIC belum dipilih</option>
            {people.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}
          </select>
          <input className="input" type="date" aria-label={`Tenggat tugas ${index + 1}`} value={action.dueDate ?? ""} onChange={event => setAction(index, { dueDate: event.target.value || null })} />
          <button type="button" className={css.remove} aria-label={`Hapus tugas ${index + 1}`} onClick={() => setDraft({ ...draft, actions: draft.actions.filter((_, at) => at !== index) })}><Trash2 size={18} aria-hidden /></button>
        </li>)}</ol>
        {draft.actions.length < minutesLimits.actions && <button type="button" className="button button--secondary" onClick={() => setDraft({ ...draft, actions: [...draft.actions, blankAction()] })}><Plus size={18} aria-hidden /> Tambah tindak lanjut</button>}
      </fieldset>
      {error && <Notice tone="error">{error}</Notice>}
      <div className={css.buttons}>
        <button type="button" className="button button--secondary" disabled={busy} onClick={() => { setDraft(null); setError(null); }}>Batal</button>
        <button type="submit" className="button button--primary" disabled={busy}>{busy ? "Menyimpan…" : "Simpan notulen"}</button>
      </div>
    </form>
  </section>;

  return <section className={css.panel} aria-label="Notulen">
    {heading}
    {notice && <p role="status" className={css.saved}><CheckCircle2 size={16} aria-hidden /> {notice}</p>}
    {minutes ? <>
      {minutes.summary && <div><p className={css.label}>Ringkasan</p><p className={css.text}>{minutes.summary}</p></div>}
      {minutes.decisions && <div><p className={css.label}>Keputusan</p><p className={css.text}>{minutes.decisions}</p></div>}
      {minutes.actions.length > 0 && <div>
        <p className={css.label}>Tindak lanjut</p>
        <ul className={css.actionList}>{minutes.actions.map(action => {
          const mayTick = canWrite || action.picId === view.viewerId;
          const text = <span className={css.actionText}>
            <span className={action.done ? css.done : undefined}>{action.task}</span>
            <small>{[action.picName ? `PIC ${action.picName}` : "PIC belum dipilih", action.dueDate ? `tenggat ${dayLabel(action.dueDate)}` : null].filter(Boolean).join(" · ")}</small>
          </span>;
          return <li key={action.id ?? action.task}>
            {mayTick ? <label className={css.actionItem}><input type="checkbox" checked={action.done} onChange={event => { void tick(action, event.target.checked); }} />{text}</label>
              : <div className={css.actionItem}><span className={css.bullet} aria-hidden>{action.done ? "✓" : "•"}</span>{text}</div>}
          </li>;
        })}</ul>
      </div>}
      <p className={styles.hint}>Dicatat {minutes.submittedBy ?? "peserta"} · {stamp(minutes.submittedAt)}{minutes.updatedAt !== minutes.submittedAt && minutes.updatedBy ? ` · diubah ${minutes.updatedBy}, ${stamp(minutes.updatedAt)}` : ""}</p>
    </> : <p className={styles.hint}>{status === "belum" ? "Meeting sudah selesai, notulennya belum diisi." : view.open ? "Belum ada notulen." : "Notulen bisa ditulis setelah meeting dimulai."}</p>}
    {error && <Notice tone="error">{error}</Notice>}
    {canWrite && <div><button type="button" className={`button ${minutes ? "button--secondary" : "button--primary"}`} onClick={start}>
      <NotebookPen size={18} aria-hidden /> {minutes ? "Ubah notulen" : "Tulis notulen"}
    </button></div>}
  </section>;
}
