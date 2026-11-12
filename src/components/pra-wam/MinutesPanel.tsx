"use client";

import { useId, useState } from "react";
import { CheckCircle2, Download, NotebookPen, Plus, Send, Trash2 } from "lucide-react";
import { Notice } from "@/components/ui";
import { dayLabel } from "@/lib/pra-wam/appraisal";
import { minutesApi, minutesLimits, minutesStatusLabels, type MinuteAction, type MinutesView } from "@/lib/pra-wam/minutes";
import { errorText, praWamRequest } from "./api";
import { useConfirm } from "./ConfirmDialog";
import styles from "./pra-wam.module.css";
import css from "./minutes.module.css";

type Draft = { summary: string; decisions: string; actions: MinuteAction[]; telegramOff: boolean };
const stamp = (iso: string) => new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(new Date(iso)).replace(":", ".");
const clock = (iso: string) => new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(new Date(iso)).replace(":", ".");
const blankAction = (): MinuteAction => ({ task: "", picId: null, dueDate: null, done: false });
/** "Werkudara CoE · Center of Excellence dan Werkudara SM · Commercial". */
const joined = (names: readonly string[]) => names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} dan ${names[names.length - 1]}`;

/**
 * Notulen (MoM) in Detail sesi (11 Nov 2026): what was summed up and decided, and the follow-ups
 * with their PIC and due date. Anyone in the meeting writes it once it has started (whoever saves
 * is its notetaker); the PIC or anyone in it ticks a follow-up done. Panitia, BOD and the HOD/Lead
 * of the booker's department read it.
 *
 * 12 Nov 2026: Simpan draf keeps it to those in the meeting; Kirim MoM sends it, as a PDF, to the
 * meeting's Telegram groups (named before it goes) and tells the others in WAM. Once sent, each
 * save is a new version and the Telegram messages change with it, without a sound.
 */
export function MinutesPanel({ sessionId, initial }: { sessionId: string; initial: MinutesView }) {
  const uid = useId();
  const [view, setView] = useState(initial);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState<"draft" | "send" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirm, confirmDialog] = useConfirm();
  const { minutes, status, canWrite, people, telegram } = view;
  const sent = !!minutes?.sentAt;
  // Before migration 202611120004 there are no drafts: a save is the MoM itself.
  const drafts = view.drafts;

  function start() {
    setNotice(null); setError(null);
    setDraft(minutes
      ? { summary: minutes.summary, decisions: minutes.decisions, actions: minutes.actions.map(action => ({ ...action })), telegramOff: minutes.telegramOff }
      : { summary: "", decisions: "", actions: [], telegramOff: false });
  }
  const setAction = (index: number, patch: Partial<MinuteAction>) => setDraft(current => current && { ...current, actions: current.actions.map((action, at) => at === index ? { ...action, ...patch } : action) });

  /** Where Kirim MoM goes, in words, for the question before it goes. */
  function sendQuestion(off: boolean) {
    const running = view.endsAt && new Date(view.endsAt) > new Date() ? `Meeting ini belum selesai (selesai ${clock(view.endsAt)}). ` : "";
    const where = off ? "MoM tidak dikirim ke Telegram (Anda memilih begitu); peserta lain diberi tahu di WAM."
      : !telegram.ready ? `${telegram.reason ?? "Telegram belum siap."} Peserta lain tetap diberi tahu di WAM.`
        : telegram.destinations.length ? `PDF MoM dikirim ke grup Telegram ${joined(telegram.destinations)}, dan peserta lain diberi tahu di WAM.`
          : "Belum ada grup Telegram untuk peserta meeting ini, jadi MoM hanya dikirim di WAM.";
    return `${running}${where} Setelah dikirim, perubahan tetap bisa disimpan sebagai versi baru.`;
  }

  async function save(send: boolean) {
    if (!draft) return;
    const actions = draft.actions.filter(action => action.task.trim()).map(({ id, task, picId, dueDate, done }) => ({ ...(id ? { id } : {}), task: task.trim(), picId, dueDate, done }));
    if (send && !(await confirm({ title: "Kirim MoM?", body: sendQuestion(draft.telegramOff), confirmLabel: "Kirim MoM" }))) return;
    setBusy(send ? "send" : "draft"); setError(null);
    try {
      const result = await praWamRequest<MinutesView>(minutesApi.session(sessionId), {
        method: "PUT", json: { summary: draft.summary, decisions: draft.decisions, actions, send, telegramOff: draft.telegramOff },
      });
      setView(result.data); setDraft(null); setNotice(result.message);
    } catch (problem) { setError(errorText(problem)); }
    finally { setBusy(null); }
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
    {view.migrated && <span className={`${styles.pill} ${status === "belum" || status === "draf" ? styles.pillBrass : styles.pillLine}`}>{minutesStatusLabels[status]}</span>}
  </div>;

  if (!view.migrated) return <section className={css.panel} aria-label="Notulen">{heading}<p className={styles.hint}>Notulen bisa ditulis setelah pembaruan sistem selesai.</p></section>;

  if (draft) {
    const nextVersion = (minutes?.version ?? 1) + 1;
    return <section className={css.panel} aria-label="Notulen">
      {heading}
      <form className={css.form} onSubmit={event => { event.preventDefault(); void save(drafts && !sent); }}>
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
          <ol className={css.actionRows}>{draft.actions.map((action, index) => <li key={action.id ?? `new-${index}`} className={css.actionRow}>
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
        {drafts && <label className={css.check}>
          <input type="checkbox" checked={draft.telegramOff} onChange={event => setDraft({ ...draft, telegramOff: event.target.checked })} />
          <span>Jangan kirim ke Telegram<small>Untuk meeting yang sensitif. MoM tetap ada di WAM untuk yang boleh membacanya.</small></span>
        </label>}
        {error && <Notice tone="error">{error}</Notice>}
        <p className={styles.hint}>{!drafts ? "Notulen langsung terlihat oleh yang boleh membacanya setelah disimpan."
          : sent ? (draft.telegramOff ? `Disimpan sebagai versi ${nextVersion}, tanpa Telegram.` : `Disimpan sebagai versi ${nextVersion}. Pesan MoM di Telegram ikut diganti tanpa bunyi.`)
            : "Simpan draf hanya terlihat oleh yang ikut meeting. Kirim MoM membagikannya."}</p>
        <div className={css.buttons}>
          <button type="button" className="button button--secondary" disabled={busy !== null} onClick={() => { setDraft(null); setError(null); }}>Batal</button>
          {drafts && !sent && <button type="button" className="button button--secondary" disabled={busy !== null} onClick={() => { void save(false); }}>{busy === "draft" ? "Menyimpan…" : "Simpan draf"}</button>}
          <button type="submit" className="button button--primary" disabled={busy !== null}>
            {drafts && !sent ? <><Send size={18} aria-hidden /> {busy === "send" ? "Mengirim…" : "Kirim MoM"}</> : busy ? "Menyimpan…" : sent ? "Simpan perubahan" : "Simpan notulen"}
          </button>
        </div>
      </form>
      {confirmDialog}
    </section>;
  }

  const failed = telegram.deliveries.filter(item => item.status === "gagal");
  return <section className={css.panel} aria-label="Notulen">
    {heading}
    {notice && <p role="status" className={css.saved}><CheckCircle2 size={16} aria-hidden /> {notice}</p>}
    {minutes ? <>
      {!sent && <Notice tone="info">Draf: belum dikirim ke siapa pun. Yang lain baru bisa membacanya setelah Kirim MoM.</Notice>}
      {minutes.summary && <div><p className={css.label}>Ringkasan</p><p className={css.text}>{minutes.summary}</p></div>}
      {minutes.decisions && <div><p className={css.label}>Keputusan</p><p className={css.text}>{minutes.decisions}</p></div>}
      {minutes.actions.length > 0 && <div>
        <p className={css.label}>Tindak lanjut</p>
        <ul className={css.actionList}>{minutes.actions.map(action => {
          const mayTick = sent && (canWrite || action.picId === view.viewerId);
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
      <p className={styles.hint}>
        Dicatat {minutes.submittedBy ?? "peserta"} · {stamp(minutes.submittedAt)}
        {sent && minutes.sentAt && drafts ? ` · dikirim ${minutes.sentBy ?? ""}${minutes.sentBy ? ", " : ""}${stamp(minutes.sentAt)} · versi ${Math.max(1, minutes.version)}` : ""}
        {minutes.updatedAt !== minutes.submittedAt && minutes.updatedBy ? ` · diubah ${minutes.updatedBy}, ${stamp(minutes.updatedAt)}` : ""}
      </p>
      {sent && drafts && <div className={css.telegram}>
        {minutes.telegramOff ? <p>Tidak dikirim ke Telegram (dipilih notulis).</p>
          : telegram.deliveries.length ? <p>Telegram: {telegram.deliveries.map(item => `${item.title} (${item.status === "terkirim" ? `versi ${item.version}` : "gagal"})`).join(" · ")}</p>
            : <p>{telegram.reason ?? "Belum ada grup Telegram untuk peserta meeting ini."}</p>}
        {failed.length > 0 && <p className={css.warn}>{failed.map(item => `${item.title}: ${item.error ?? "gagal"}`).join(" · ")}. Dicoba lagi saat notulen disimpan berikutnya.</p>}
      </div>}
      <div className={css.buttons}>
        <a className="button button--secondary" href={minutesApi.pdf(sessionId)} download><Download size={18} aria-hidden /> Unduh PDF</a>
      </div>
    </> : <p className={styles.hint}>{status === "belum" ? "Meeting sudah selesai, notulennya belum diisi." : status === "draf" ? "Notulen sedang ditulis." : view.open ? "Belum ada notulen." : "Notulen bisa ditulis setelah meeting dimulai."}</p>}
    {error && <Notice tone="error">{error}</Notice>}
    {canWrite && <div className={css.buttons}>
      <button type="button" className={`button ${minutes ? "button--secondary" : "button--primary"}`} onClick={start}>
        <NotebookPen size={18} aria-hidden /> {!minutes ? "Tulis notulen" : sent ? "Ubah notulen" : "Lanjutkan draf"}
      </button>
    </div>}
    {confirmDialog}
  </section>;
}
