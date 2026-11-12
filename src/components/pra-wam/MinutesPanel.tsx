"use client";

import { useId, useRef, useState } from "react";
import { CheckCircle2, ChevronDown, Download, ImagePlus, NotebookPen, Plus, Send, Trash2, X } from "lucide-react";
import { Notice } from "@/components/ui";
import { dayLabel } from "@/lib/pra-wam/appraisal";
import {
  defaultAbsent, minutesApi, minutesItems, minutesLimits, minutesStatusLabels, presence,
  type MinuteAction, type MinuteItem, type MinutePhoto, type MinutesView, type NextMeeting,
} from "@/lib/pra-wam/minutes";
import { MOM_PHOTOS_MAX } from "@/lib/pra-wam/minutes-photos";
import { acceptPhotos } from "@/lib/pra-wam/photo";
import { errorText, praWamRequest } from "./api";
import { useConfirm } from "./ConfirmDialog";
import { prepareMinutePhoto, uploadMinutePhoto } from "./minutesPhotoUpload";
import styles from "./pra-wam.module.css";
import css from "./minutes.module.css";

type Draft = {
  items: MinuteItem[]; chairId: string | null; absentIds: string[]; guests: string; next: NextMeeting;
  actions: MinuteAction[]; telegramOff: boolean;
};
const stamp = (iso: string) => new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(new Date(iso)).replace(":", ".");
const clock = (iso: string) => new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(new Date(iso)).replace(":", ".");
const blankAction = (): MinuteAction => ({ task: "", picId: null, dueDate: null, done: false });
const blankItem = (): MinuteItem => ({ topic: "", discussion: "", decision: "", added: false });
const noNext = (): NextMeeting => ({ date: null, time: null, place: "", agenda: "" });
/** "Werkudara CoE · Center of Excellence dan Werkudara SM · Commercial". */
const joined = (names: readonly string[]) => names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} dan ${names[names.length - 1]}`;
const filled = (item: MinuteItem) => !!(item.topic.trim() || item.discussion.trim() || item.decision.trim());

/** Why the agenda items cannot be saved yet, or null. */
function itemsProblem(items: readonly MinuteItem[]): string | null {
  const given = items.filter(filled);
  if (!given.length) return "Isi minimal satu topik dengan pembahasan atau keputusannya.";
  for (const [index, item] of items.entries()) {
    if (!filled(item)) continue;
    if (item.topic.trim().length < 2) return `Isi topik nomor ${index + 1}.`;
    if (item.discussion.trim().length < 2 && item.decision.trim().length < 2) return `Isi pembahasan atau keputusan untuk "${item.topic.trim()}".`;
  }
  return null;
}

/**
 * The meeting's photos (12 Nov 2026): a gallery, each opening the full photo. Whoever may write
 * the MoM adds them (made small here, then uploaded one by one with progress) and removes them;
 * they are kept at once and go into the MoM's PDF.
 */
function MinutePhotos({ sessionId, photos, editable, ready, sent, onChange }: {
  sessionId: string; photos: MinutePhoto[]; editable: boolean; ready: boolean; sent: boolean; onChange: (photos: MinutePhoto[]) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<{ at: number; total: number; share: number } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [confirm, confirmDialog] = useConfirm();
  const room = MOM_PHOTOS_MAX - photos.length;

  async function add(files: File[]) {
    setProblem(null);
    const taken = files.slice(0, Math.max(0, room));
    const problems: string[] = [];
    if (files.length > taken.length) problems.push(`Paling banyak ${MOM_PHOTOS_MAX} foto per meeting; ${files.length - taken.length} foto tidak ditambahkan.`);
    for (const [index, file] of taken.entries()) {
      setProgress({ at: index + 1, total: taken.length, share: 0 });
      try {
        const ready = await prepareMinutePhoto(file);
        onChange(await uploadMinutePhoto(sessionId, ready, share => setProgress({ at: index + 1, total: taken.length, share })));
      } catch (error) { problems.push(`${file.name}: ${errorText(error)}`); }
    }
    setProgress(null);
    if (problems.length) setProblem(problems.join(" "));
  }

  async function remove(photo: MinutePhoto, number: number) {
    if (!(await confirm({ title: "Hapus foto ini?", body: `Foto ${number} dihapus dari MoM dan dari penyimpanan.`, confirmLabel: "Hapus foto", danger: true }))) return;
    setProblem(null);
    try { onChange((await praWamRequest<MinutePhoto[]>(minutesApi.photo(sessionId, photo.id), { method: "DELETE" })).data); }
    catch (error) { setProblem(errorText(error)); }
  }

  if (!photos.length && !(editable && ready)) return null;
  return <div className={css.photos}>
    <div className={css.photosHead}>
      <p className={css.label}>Foto meeting</p>
      {editable && <span className={css.photosCount}>{photos.length} dari {MOM_PHOTOS_MAX}</span>}
    </div>
    {photos.length > 0 && <ul className={css.gallery}>{photos.map((photo, index) => <li key={photo.id}>
      <a href={photo.url} target="_blank" rel="noreferrer" className={css.thumb} aria-label={`Buka foto ${index + 1}${photo.uploadedBy ? `, dari ${photo.uploadedBy}` : ""}`}>
        {/* eslint-disable-next-line @next/next/no-img-element -- a redirect to a signed address that expires; next/image would cache it */}
        <img src={photo.url} alt="" loading="lazy" decoding="async" />
      </a>
      {editable && photo.canDelete && <button type="button" className={css.thumbRemove} aria-label={`Hapus foto ${index + 1}`} onClick={() => { void remove(photo, index + 1); }}><X size={16} aria-hidden /></button>}
    </li>)}</ul>}
    {editable && ready && <>
      <input ref={input} type="file" accept={acceptPhotos} multiple hidden aria-hidden="true" tabIndex={-1}
        onChange={event => { const files = [...(event.target.files ?? [])]; event.target.value = ""; if (files.length) void add(files); }} />
      {room > 0 && <button type="button" className="button button--secondary" disabled={!!progress} onClick={() => input.current?.click()}>
        <ImagePlus size={18} aria-hidden /> {progress ? `Mengunggah ${progress.at} dari ${progress.total} (${Math.round(progress.share * 100)}%)` : photos.length ? "Tambah foto" : "Unggah foto meeting"}
      </button>}
      <p className={styles.hint}>{sent ? "Foto langsung tersimpan. PDF di Telegram ikut diperbarui saat notulen disimpan berikutnya." : "Foto langsung tersimpan dan ikut di PDF MoM."}</p>
    </>}
    {problem && <Notice tone="error">{problem}</Notice>}
    {confirmDialog}
  </div>;
}

/**
 * Notulen (MoM) in Detail sesi (11 Nov 2026). Anyone in the meeting writes it once it has started
 * (whoever saves first is its notetaker); the PIC or anyone in it ticks a follow-up done. Panitia,
 * BOD and the HOD/Lead of the booker's department read it.
 *
 * 12 Nov 2026: Simpan draf keeps it to those in the meeting; Kirim MoM sends it, as a PDF, to the
 * meeting's Telegram groups (named before it goes) and tells the others in WAM. Once sent, each
 * save is a new version and the Telegram messages change with it, without a sound.
 *
 * 12 Nov 2026, form FRM.05.00.00.027 kept simple: the MoM's number (given on the first save), the
 * chairperson, who came (from check-in, changeable) and others who came, the agenda items (topic,
 * discussion, decision; new topics marked), the follow-ups, the next meeting, and the photos.
 */
export function MinutesPanel({ sessionId, initial }: { sessionId: string; initial: MinutesView }) {
  const uid = useId();
  const [view, setView] = useState(initial);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState<"draft" | "send" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirm, confirmDialog] = useConfirm();
  const { minutes, status, canWrite, people, telegram, frm, attendees } = view;
  const sent = !!minutes?.sentAt;
  // Before migration 202611120004 there are no drafts: a save is the MoM itself.
  const drafts = view.drafts;
  const setPhotos = (photos: MinutePhoto[]) => setView(current => ({ ...current, photos }));

  /** The form's content: the MoM as saved, or a new one (chair, who came from check-in). */
  function draftOf(): Draft {
    const items = minutes ? minutesItems(minutes).map(item => ({ ...item })) : [];
    return {
      items: items.length ? items : [blankItem()],
      chairId: minutes?.chairId ?? view.defaultChairId,
      absentIds: minutes ? [...minutes.absentIds] : defaultAbsent(attendees),
      guests: minutes?.guests ?? "", next: minutes?.next ? { ...minutes.next } : noNext(),
      actions: minutes ? minutes.actions.map(action => ({ ...action })) : [], telegramOff: minutes?.telegramOff ?? false,
    };
  }
  function start() {
    setNotice(null); setError(null);
    setDraft(draftOf());
  }
  const patch = (change: Partial<Draft>) => setDraft(current => current && { ...current, ...change });
  const setAction = (index: number, change: Partial<MinuteAction>) => setDraft(current => current && { ...current, actions: current.actions.map((action, at) => at === index ? { ...action, ...change } : action) });
  const setItem = (index: number, change: Partial<MinuteItem>) => setDraft(current => current && { ...current, items: current.items.map((item, at) => at === index ? { ...item, ...change } : item) });
  const setNext = (change: Partial<NextMeeting>) => setDraft(current => current && { ...current, next: { ...current.next, ...change } });

  /** Where Kirim MoM goes, in words, for the question before it goes. */
  function sendQuestion(off: boolean) {
    const running = view.endsAt && new Date(view.endsAt) > new Date() ? `Meeting ini belum selesai (selesai ${clock(view.endsAt)}). ` : "";
    const where = off ? "MoM tidak dikirim ke Telegram (Anda memilih begitu); peserta lain diberi tahu di WAM."
      : !telegram.ready ? `${telegram.reason ?? "Telegram belum siap."} Peserta lain tetap diberi tahu di WAM.`
        : telegram.destinations.length ? `PDF MoM dikirim ke grup Telegram ${joined(telegram.destinations)}, dan peserta lain diberi tahu di WAM.`
          : "Belum ada grup Telegram untuk peserta meeting ini, jadi MoM hanya dikirim di WAM.";
    return `${running}${where} Setelah dikirim, perubahan tetap bisa disimpan sebagai versi baru.`;
  }

  /**
   * Saves the form's content; with `send`, after asking where it goes. A draft is also sent straight
   * from reading it (12 Nov 2026): the same content, sent.
   */
  async function save(send: boolean, content: Draft | null = draft) {
    if (!content) return;
    const problem = itemsProblem(content.items);
    if (problem) { setError(problem); return; }
    const items = content.items.filter(filled).map(item => ({ topic: item.topic.trim(), discussion: item.discussion.trim(), decision: item.decision.trim(), added: item.added }));
    const actions = content.actions.filter(action => action.task.trim()).map(({ id, task, picId, dueDate, done }) => ({ ...(id ? { id } : {}), task: task.trim(), picId, dueDate, done }));
    if (send && !(await confirm({ title: "Kirim MoM?", body: sendQuestion(content.telegramOff), confirmLabel: "Kirim MoM" }))) return;
    setBusy(send ? "send" : "draft"); setError(null);
    const form = frm ? {
      chairId: content.chairId, absentIds: content.absentIds, guests: content.guests.trim(),
      next: { date: content.next.date || null, time: content.next.time || null, place: content.next.place.trim(), agenda: content.next.agenda.trim() },
    } : {};
    try {
      const result = await praWamRequest<MinutesView>(minutesApi.session(sessionId), {
        method: "PUT", json: { items, ...form, actions, send, telegramOff: content.telegramOff },
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
  const photoBlock = (editable: boolean) => frm && <MinutePhotos sessionId={sessionId} photos={view.photos} editable={editable && canWrite} ready={view.photosReady} sent={sent} onChange={setPhotos} />;

  if (!view.migrated) return <section className={css.panel} aria-label="Notulen">{heading}<p className={styles.hint}>Notulen bisa ditulis setelah pembaruan sistem selesai.</p></section>;

  if (draft) {
    const nextVersion = (minutes?.version ?? 1) + 1;
    const away = new Set(draft.absentIds);
    const here = attendees.filter(person => !away.has(person.id)).length;
    const nextGiven = !!(draft.next.date || draft.next.time || draft.next.place || draft.next.agenda);
    return <section className={css.panel} aria-label="Notulen">
      {heading}
      <form className={css.form} onSubmit={event => { event.preventDefault(); void save(drafts && !sent); }}>
        {!frm && <Notice tone="info">Pimpinan rapat, kehadiran, meeting berikutnya, dan foto bisa diisi setelah pembaruan sistem selesai. Sementara itu agenda disimpan sebagai ringkasan dan keputusan.</Notice>}

        {frm && <fieldset className={css.group}>
          <legend className={css.groupTitle}>Info meeting</legend>
          <p className={styles.hint}>{minutes?.number ? `No. ${minutes.number}` : "Nomor MoM dibuat otomatis saat pertama disimpan."} · Notulis: {minutes?.submittedBy ?? "yang pertama menyimpan"}</p>
          <div>
            <label className={styles.label} htmlFor={`${uid}-chair`}>Pimpinan rapat</label>
            <select id={`${uid}-chair`} className="select" value={draft.chairId ?? ""} onChange={event => patch({ chairId: event.target.value || null })}>
              <option value="">Belum dipilih</option>
              {people.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}
            </select>
          </div>
        </fieldset>}

        {frm && attendees.length > 0 && <fieldset className={css.group}>
          <legend className={css.groupTitle}>Kehadiran <span className={css.groupCount}>{here} dari {attendees.length} hadir</span></legend>
          <p className={styles.hint}>{attendees.some(person => person.checkedIn) ? "Diisi dari check-in. Hapus centang untuk yang tidak hadir." : "Hapus centang untuk yang tidak hadir."}</p>
          <ul className={css.people}>{attendees.map(person => <li key={person.id}>
            <label className={css.check}>
              <input type="checkbox" checked={!away.has(person.id)}
                onChange={event => patch({ absentIds: event.target.checked ? draft.absentIds.filter(id => id !== person.id) : [...draft.absentIds, person.id] })} />
              <span>{person.fullName}<small>{[person.department, person.position, person.checkedIn ? "check-in" : null].filter(Boolean).join(" · ") || "Data karyawan belum lengkap"}</small></span>
            </label>
          </li>)}</ul>
          <div>
            <label className={styles.label} htmlFor={`${uid}-guests`}>Peserta lain yang hadir</label>
            <input id={`${uid}-guests`} className="input" maxLength={minutesLimits.guests} value={draft.guests} placeholder="Tamu atau rekan di luar daftar, pisahkan dengan koma"
              onChange={event => patch({ guests: event.target.value })} />
          </div>
        </fieldset>}

        <fieldset className={css.group}>
          <legend className={css.groupTitle}>Agenda dan pembahasan</legend>
          <ol className={css.items}>{draft.items.map((item, index) => <li key={index} className={css.item}>
            <div className={css.itemHead}>
              <span className={css.itemNo}>{index + 1}</span>
              <input className="input" aria-label={`Topik ${index + 1}`} value={item.topic} maxLength={minutesLimits.topic} placeholder="Topik"
                onChange={event => setItem(index, { topic: event.target.value })} />
              {draft.items.length > 1 && <button type="button" className={css.remove} aria-label={`Hapus topik ${index + 1}`} onClick={() => patch({ items: draft.items.filter((_, at) => at !== index) })}><Trash2 size={18} aria-hidden /></button>}
            </div>
            <div>
              <label className={css.fieldLabel} htmlFor={`${uid}-discussion-${index}`}>Pembahasan dan poin penting</label>
              <textarea id={`${uid}-discussion-${index}`} className="textarea" rows={3} aria-label={`Pembahasan topik ${index + 1}`} maxLength={minutesLimits.text} value={item.discussion} placeholder="Apa yang dibahas"
                onChange={event => setItem(index, { discussion: event.target.value })} />
            </div>
            <div>
              <label className={css.fieldLabel} htmlFor={`${uid}-decision-${index}`}>Keputusan</label>
              <textarea id={`${uid}-decision-${index}`} className="textarea" rows={2} aria-label={`Keputusan topik ${index + 1}`} maxLength={minutesLimits.decision} value={item.decision} placeholder="Yang disepakati, satu per baris"
                onChange={event => setItem(index, { decision: event.target.value })} />
            </div>
            <label className={css.checkSmall}>
              <input type="checkbox" checked={item.added} onChange={event => setItem(index, { added: event.target.checked })} />
              <span>Topik baru (di luar agenda)</span>
            </label>
          </li>)}</ol>
          {draft.items.length < minutesLimits.items && <button type="button" className="button button--secondary" onClick={() => patch({ items: [...draft.items, blankItem()] })}><Plus size={18} aria-hidden /> Tambah topik</button>}
        </fieldset>

        <fieldset className={css.group}>
          <legend className={css.groupTitle}>Tindak lanjut</legend>
          {draft.actions.length === 0 && <p className={styles.hint}>Belum ada. Tambahkan tugas dengan PIC dan tenggatnya.</p>}
          <ol className={css.actionRows}>{draft.actions.map((action, index) => <li key={action.id ?? `new-${index}`} className={css.actionRow}>
            <input className="input" aria-label={`Tugas ${index + 1}`} value={action.task} maxLength={minutesLimits.task} placeholder="Tugas"
              onChange={event => setAction(index, { task: event.target.value })} />
            <select className="select" aria-label={`PIC tugas ${index + 1}`} value={action.picId ?? ""} onChange={event => setAction(index, { picId: event.target.value || null })}>
              <option value="">PIC belum dipilih</option>
              {people.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}
            </select>
            <input className="input" type="date" aria-label={`Tenggat tugas ${index + 1}`} value={action.dueDate ?? ""} onChange={event => setAction(index, { dueDate: event.target.value || null })} />
            <button type="button" className={css.remove} aria-label={`Hapus tugas ${index + 1}`} onClick={() => patch({ actions: draft.actions.filter((_, at) => at !== index) })}><Trash2 size={18} aria-hidden /></button>
          </li>)}</ol>
          {draft.actions.length < minutesLimits.actions && <button type="button" className="button button--secondary" onClick={() => patch({ actions: [...draft.actions, blankAction()] })}><Plus size={18} aria-hidden /> Tambah tindak lanjut</button>}
        </fieldset>

        {frm && <details className={css.group} open={nextGiven || undefined}>
          <summary className={css.groupTitle}>Meeting berikutnya <span className={css.groupCount}>opsional</span><ChevronDown className={css.chevron} size={18} aria-hidden /></summary>
          <div className={css.nextGrid}>
            <div><label className={styles.label} htmlFor={`${uid}-next-date`}>Tanggal</label>
              <input id={`${uid}-next-date`} className="input" type="date" value={draft.next.date ?? ""} onChange={event => setNext({ date: event.target.value || null })} /></div>
            <div><label className={styles.label} htmlFor={`${uid}-next-time`}>Jam</label>
              <input id={`${uid}-next-time`} className="input" type="time" value={draft.next.time ?? ""} onChange={event => setNext({ time: event.target.value || null })} /></div>
          </div>
          <div><label className={styles.label} htmlFor={`${uid}-next-place`}>Tempat atau platform</label>
            <input id={`${uid}-next-place`} className="input" maxLength={minutesLimits.place} value={draft.next.place} placeholder="Ruang rapat, Zoom, atau lainnya" onChange={event => setNext({ place: event.target.value })} /></div>
          <div><label className={styles.label} htmlFor={`${uid}-next-agenda`}>Rancangan agenda</label>
            <textarea id={`${uid}-next-agenda`} className="textarea" rows={2} maxLength={minutesLimits.agenda} value={draft.next.agenda} placeholder="Yang akan dibahas" onChange={event => setNext({ agenda: event.target.value })} /></div>
        </details>}

        {photoBlock(true)}

        {drafts && <label className={css.check}>
          <input type="checkbox" checked={draft.telegramOff} onChange={event => patch({ telegramOff: event.target.checked })} />
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
  const items = minutes ? minutesItems(minutes) : [];
  // Who came is kept from the FRM form on (a MoM with a number).
  const { present, absent } = presence(attendees, minutes?.absentIds ?? []);
  const showPresence = frm && !!minutes?.number && attendees.length > 0;
  const next = minutes?.next;
  return <section className={css.panel} aria-label="Notulen">
    {heading}
    {notice && <p role="status" className={css.saved}><CheckCircle2 size={16} aria-hidden /> {notice}</p>}
    {minutes ? <>
      {!sent && <Notice tone="info">Draf: belum dikirim ke siapa pun. Yang lain baru bisa membacanya setelah Kirim MoM.</Notice>}
      {(minutes.number || minutes.chairName) && <dl className={css.facts}>
        {minutes.number && <><dt>No. MoM</dt><dd>{minutes.number}</dd></>}
        {frm && <><dt>Pimpinan rapat</dt><dd>{minutes.chairName ?? "Belum dipilih"}</dd></>}
        <dt>Notulis</dt><dd>{minutes.submittedBy ?? "Peserta"}</dd>
      </dl>}
      {showPresence && <div>
        <p className={css.label}>Kehadiran · {present.length} dari {attendees.length} hadir</p>
        <p className={css.text}>Hadir: {present.map(person => person.fullName).join(", ") || "belum ada"}</p>
        {absent.length > 0 && <p className={css.text}>Tidak hadir: {absent.map(person => person.fullName).join(", ")}</p>}
        {minutes.guests && <p className={css.text}>Peserta lain: {minutes.guests}</p>}
      </div>}
      {items.length > 0 && <div>
        <p className={css.label}>Agenda dan pembahasan</p>
        <ol className={css.readItems}>{items.map((item, index) => <li key={index}>
          <p className={css.readTopic}><span className={css.itemNo}>{index + 1}</span> {item.topic}{item.added && <span className={`${styles.pill} ${styles.pillLine}`}>Topik baru</span>}</p>
          {item.discussion && <p className={css.text}>{item.discussion}</p>}
          {item.decision && <p className={css.decision}><strong>Keputusan:</strong> {item.decision}</p>}
        </li>)}</ol>
      </div>}
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
      {next && <div>
        <p className={css.label}>Meeting berikutnya</p>
        <p className={css.text}>{[next.date ? dayLabel(next.date) : null, next.time ? `${next.time.replace(":", ".")} WIB` : null, next.place || null].filter(Boolean).join(" · ") || "Belum dijadwalkan"}</p>
        {next.agenda && <p className={css.text}>Agenda: {next.agenda}</p>}
      </div>}
      {photoBlock(true)}
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
    </> : <>
      <p className={styles.hint}>{status === "belum" ? "Meeting sudah selesai, notulennya belum diisi." : status === "draf" ? "Notulen sedang ditulis." : view.open ? "Belum ada notulen." : "Notulen bisa ditulis setelah meeting dimulai."}</p>
      {canWrite && photoBlock(true)}
    </>}
    {error && <Notice tone="error">{error}</Notice>}
    {canWrite && <div className={css.buttons}>
      <button type="button" className={`button ${minutes ? "button--secondary" : "button--primary"}`} onClick={start}>
        <NotebookPen size={18} aria-hidden /> {!minutes ? "Tulis notulen" : sent ? "Ubah notulen" : "Lanjutkan draf"}
      </button>
      {/* A draft that is ready goes without opening the form again. */}
      {minutes && !sent && drafts && <button type="button" className="button button--primary" disabled={busy !== null} onClick={() => { void save(true, draftOf()); }}>
        <Send size={18} aria-hidden /> {busy === "send" ? "Mengirim…" : "Kirim MoM"}
      </button>}
    </div>}
    {confirmDialog}
  </section>;
}
