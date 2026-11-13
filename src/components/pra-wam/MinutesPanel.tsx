"use client";

import { useId, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Camera, CheckCircle2, ChevronRight, Download, ExternalLink, ImagePlus, NotebookPen, Plus, Search, Send, Trash2, X } from "lucide-react";
import { Notice } from "@/components/ui";
import { wibDate, wibTime } from "@/lib/pra-wam/appraisal";
import {
  defaultAbsent, minutesApi, minutesItems, minutesLimits, minutesStatusLabels, MOM_DOC_NUMBER_MAX, MOM_NUMBER_REGISTER, presence, selfCheckedIn,
  type MinuteAction, type MinuteAttendee, type MinuteItem, type MinutePhoto, type MinutesView, type NextMeeting,
} from "@/lib/pra-wam/minutes";
import { frmDate, frmDue, frmTime, guestNames } from "@/lib/pra-wam/minutes-message";
import { MOM_PHOTOS_MAX, momPhotoRule } from "@/lib/pra-wam/minutes-photos";
import { acceptPhotos } from "@/lib/pra-wam/photo";
import { errorText, praWamRequest } from "./api";
import { useConfirm } from "./ConfirmDialog";
import { prepareMinutePhoto, uploadMinutePhoto } from "./minutesPhotoUpload";
import styles from "./pra-wam.module.css";
import css from "./minutes.module.css";

type Draft = {
  items: MinuteItem[]; chairId: string | null; absentIds: string[]; guests: string; next: NextMeeting;
  actions: MinuteAction[]; telegramOff: boolean; docNumber: string;
};
const stamp = (iso: string) => new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(new Date(iso)).replace(":", ".");
const clock = (iso: string) => new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(new Date(iso)).replace(":", ".");
const blankAction = (): MinuteAction => ({ task: "", picId: null, dueDate: null, done: false });
const blankItem = (): MinuteItem => ({ topic: "", discussion: "", decision: "", added: false });
const noNext = (): NextMeeting => ({ date: null, time: null, place: "", agenda: "" });
/** "Werkudara CoE · Center of Excellence dan Werkudara SM · Commercial". */
const joined = (names: readonly string[]) => names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} dan ${names[names.length - 1]}`;
const filled = (item: MinuteItem) => !!(item.topic.trim() || item.discussion.trim() || item.decision.trim());

/** A phone-sized screen (12 Nov 2026): the MoM form is then a few steps, one screen each. */
const PHONE = "(max-width: 719px)";
const phoneQuery = () => (typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia(PHONE) : null);
function usePhone(): boolean {
  return useSyncExternalStore(
    change => { const query = phoneQuery(); query?.addEventListener("change", change); return () => query?.removeEventListener("change", change); },
    () => phoneQuery()?.matches ?? false,
    () => false,
  );
}

/** Why the agenda items (III) and new topics (IV) cannot be saved yet, or null. */
function itemsProblem(items: readonly MinuteItem[]): string | null {
  if (!items.some(filled)) return "Isi minimal satu agenda (III) dengan pembahasan atau keputusannya.";
  for (const [index, item] of items.entries()) {
    if (!filled(item)) continue;
    if (item.topic.trim().length < 2) return `Isi topik agenda nomor ${index + 1}.`;
    if (item.discussion.trim().length < 2 && item.decision.trim().length < 2) return `Isi pembahasan atau keputusan untuk "${item.topic.trim()}".`;
  }
  return null;
}

/*
 * Form FRM.05.00.00.027 Minutes of Meeting, in its own words and order (12 Nov 2026): I Meeting
 * Information, II Attendance, III Agenda Items and Discussion, IV New Items/Topics, V Action Items,
 * VI Next Meeting, VII Attendance List, then the photos. Hints and buttons stay in Indonesian.
 */
const ACTIONS_NOTE = "List all tasks that resulted from the meeting, who is responsible, and the deadline.";

/** A section's title as the form numbers it: "III. AGENDA ITEMS AND DISCUSSION". */
const sectionTitle = (number: string, title: string, extra?: ReactNode) => <>
  {number && <><span className={css.sectionNo}>{number}</span>{" "}</>}<span>{title}</span>{extra && <>{" "}{extra}</>}
</>;

/**
 * "Others present" (13 Nov 2026): typed like a search of Data karyawan, a name picked from it or a
 * guest's name added as typed; each shows as a chip. Kept as one list, "A, B, C", as before.
 */
function GuestPicker({ id, value, staff, taken, onChange }: {
  id: string; value: string; staff: readonly { id: string; name: string; fullName: string; department: string }[]; taken: readonly string[]; onChange: (value: string) => void;
}) {
  const [query, setQuery] = useState("");
  const names = guestNames(value);
  const has = (name: string) => names.some(each => each.toLowerCase() === name.trim().toLowerCase());
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const found = words.length ? staff.filter(person => !taken.includes(person.id) && !has(person.fullName)
    && words.every(word => `${person.fullName} ${person.name} ${person.department}`.toLowerCase().includes(word))).slice(0, 6) : [];
  const put = (list: string[]) => onChange(list.join(", ").slice(0, minutesLimits.guests));
  const add = (name: string) => { const clean = name.trim().replace(/[,;]/g, " "); if (clean && !has(clean)) put([...names, clean]); setQuery(""); };
  return <div className={css.guests}>
    <label className={styles.label} htmlFor={id}>Others present</label>
    {names.length > 0 && <ul className={css.chips} aria-label="Peserta lain yang hadir">{names.map(name => <li key={name}>
      <span>{name}</span>
      <button type="button" aria-label={`Hapus ${name}`} onClick={() => put(names.filter(each => each !== name))}><X size={14} aria-hidden /></button>
    </li>)}</ul>}
    <div className={css.guestSearch}>
      <Search size={18} aria-hidden />
      <input id={id} className="input" type="search" autoComplete="off" value={query} placeholder="Cari nama karyawan, atau ketik nama tamu"
        onChange={event => setQuery(event.target.value)}
        onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); if (found.length) add(found[0].fullName); else add(query); } }} />
    </div>
    {query.trim() && <ul className={css.suggest} role="listbox" aria-label="Saran dari Data karyawan">
      {found.map(person => <li key={person.id}><button type="button" role="option" aria-selected={false} onClick={() => add(person.fullName)}>
        <span>{person.fullName}</span><small>{person.department || "Data karyawan"}</small>
      </button></li>)}
      <li><button type="button" role="option" aria-selected={false} onClick={() => add(query)}><span>Tambah &ldquo;{query.trim()}&rdquo;</span><small>sebagai tamu (bukan karyawan)</small></button></li>
    </ul>}
  </div>;
}

/** Section I's rows: the meeting from WAM, the number, the chairperson and the minute taker. */
function MeetingFacts({ view, number, chair, taker }: { view: MinutesView; number: ReactNode; chair: ReactNode; taker: string }) {
  return <dl className={css.facts}>
    {typeof number === "string" || number == null ? <><dt>MoM Number</dt><dd>{number ?? "-"}</dd></> : number}
    <dt>Meeting Title</dt><dd>{view.title || "-"}</dd>
    <dt>Date</dt><dd>{view.startsAt ? frmDate(wibDate(view.startsAt)) : "-"}</dd>
    <dt>Time Start</dt><dd>{view.startsAt ? frmTime(wibTime(view.startsAt)) : "-"}</dd>
    <dt>Time End</dt><dd>{view.endsAt ? frmTime(wibTime(view.endsAt)) : "-"}</dd>
    <dt>Location/Platform</dt><dd>{view.place || "-"}</dd>
    {chair}
    <dt>Minute Taker</dt><dd>{taker}</dd>
  </dl>;
}

/** Section VII: everyone in the meeting and the others who came; Sign is Present or Absent from WAM. */
function AttendanceList({ attendees, absentIds, guests }: { attendees: readonly MinuteAttendee[]; absentIds: readonly string[]; guests: string }) {
  const away = new Set(absentIds);
  const rows = [
    ...attendees.map(person => ({ key: person.id, cells: [person.fullName, person.department || "-", person.frmPosition || "-", away.has(person.id) ? "Absent" : "Present"] })),
    ...guestNames(guests).map((name, index) => ({ key: `guest-${index}`, cells: [name, "-", "-", "Present"] })),
  ];
  // The roles keep it a table for screen readers when a phone lays its rows out as blocks.
  return <table className={css.listTable} role="table">
    <thead role="rowgroup"><tr role="row">{["#", "Full Name", "Dept", "Position", "Sign"].map(head => <th key={head} scope="col" role="columnheader">{head}</th>)}</tr></thead>
    <tbody role="rowgroup">{rows.map((row, index) => <tr key={row.key} role="row">
      <td role="cell">{index + 1}.</td>
      {row.cells.map((cell, at) => <td key={at} role="cell" className={at === 3 && cell === "Absent" ? css.absent : cell === "-" ? css.blank : undefined}>{cell}</td>)}
    </tr>)}</tbody>
  </table>;
}

/**
 * The meeting's photos (12 Nov 2026): a gallery, each opening the full photo. Whoever may write
 * the MoM adds them (made small here, then uploaded one by one with progress) and removes them;
 * they are kept at once and go into the MoM's PDF.
 */
function MinutePhotos({ sessionId, photos, editable, ready, hd, onChange }: {
  sessionId: string; photos: MinutePhoto[]; editable: boolean; ready: boolean; hd: boolean; onChange: (photos: MinutePhoto[]) => void;
}) {
  const rule = momPhotoRule(hd);
  const input = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
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
        const ready = await prepareMinutePhoto(file, rule);
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
  return <div className={`${css.group} ${css.photos}`}>
    <div className={css.photosHead}>
      <p className={css.groupTitle}>{sectionTitle("", "DOCUMENTATION")}</p>
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
      {/* The camera straight away (a phone opens it; a computer asks for a file). */}
      <input ref={camera} type="file" accept="image/*" capture="environment" hidden aria-hidden="true" tabIndex={-1}
        onChange={event => { const files = [...(event.target.files ?? [])]; event.target.value = ""; if (files.length) void add(files); }} />
      {progress ? <p className={styles.hint} role="status">Mengunggah {progress.at} dari {progress.total} ({Math.round(progress.share * 100)}%)</p>
        : room > 0 && <div className={css.photoButtons}>
          <button type="button" className="button button--secondary" onClick={() => camera.current?.click()}><Camera size={18} aria-hidden /> Ambil foto</button>
          <button type="button" className="button button--secondary" onClick={() => input.current?.click()}><ImagePlus size={18} aria-hidden /> Dari galeri</button>
        </div>}
      <p className={styles.hint}>Foto langsung tersimpan dan ikut di PDF MoM.</p>
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
  const [step, setStep] = useState(0);
  const phone = usePhone();
  const formTop = useRef<HTMLFormElement>(null);
  const { minutes, status, canWrite, people, telegram, frm, attendees } = view;
  const sent = !!minutes?.sentAt;
  // Before migration 202611120004 there are no drafts: a save is the MoM itself.
  const drafts = view.drafts;
  const setPhotos = (photos: MinutePhoto[]) => setView(current => ({ ...current, photos }));

  /** The form's content: the MoM as saved, or a new one (chair, who came from check-in). */
  function draftOf(): Draft {
    const items = minutes ? minutesItems(minutes).map(item => ({ ...item })) : [];
    return {
      // Section III always has a row to fill.
      items: items.some(item => !item.added) ? items : [blankItem(), ...items],
      chairId: minutes?.chairId ?? view.defaultChairId,
      // Whoever checked in by themselves came, whatever an older draft said.
      absentIds: (minutes ? [...minutes.absentIds] : defaultAbsent(attendees)).filter(id => !attendees.some(person => person.id === id && selfCheckedIn(person))),
      guests: minutes?.guests ?? "", next: minutes?.next ? { ...minutes.next } : noNext(),
      actions: minutes ? minutes.actions.map(action => ({ ...action })) : [], // A new MoM goes to Telegram only once the notetaker ticks it and agrees (13 Nov 2026).
      telegramOff: minutes ? minutes.telegramOff : true,
      docNumber: minutes?.docNumber ?? "",
    };
  }
  function start() {
    setNotice(null); setError(null); setStep(0);
    setDraft(draftOf());
  }
  const patch = (change: Partial<Draft>) => setDraft(current => current && { ...current, ...change });
  const setAction = (index: number, change: Partial<MinuteAction>) => setDraft(current => current && { ...current, actions: current.actions.map((action, at) => at === index ? { ...action, ...change } : action) });
  const setItem = (index: number, change: Partial<MinuteItem>) => setDraft(current => current && { ...current, items: current.items.map((item, at) => at === index ? { ...item, ...change } : item) });
  const setNext = (change: Partial<NextMeeting>) => setDraft(current => current && { ...current, next: { ...current.next, ...change } });

  /** Where Kirim MoM goes, in words, for the question before it goes. */
  function sendQuestion(off: boolean) {
    const running = view.endsAt && new Date(view.endsAt) > new Date() ? `Meeting ini belum selesai (selesai ${clock(view.endsAt)}). ` : "";
    const where = off ? "MoM tidak dikirim ke Telegram; peserta lain diberi tahu di WAM."
      : telegram.ready && telegram.destinations.length ? `PDF MoM dikirim ke grup Telegram ${joined(telegram.destinations)}, dan peserta lain diberi tahu di WAM.`
        : "Peserta lain diberi tahu di WAM.";
    return `${running}${where} Setelah dikirim, MoM masih bisa diubah.`;
  }

  /**
   * Kirim ke Telegram (13 Nov 2026): read to the end, like agreeing to terms, then sent. Where it
   * goes and how to get into the group; installing Telegram is left to each person.
   */
  const groupLinks = (telegram.links ?? []).filter(group => !!group.url);
  function telegramTerms() {
    return <div className={css.terms}>
      <p>{telegram.destinations.length ? <>PDF MoM dikirim ke grup Telegram <strong>{joined(telegram.destinations)}</strong>.</> : "PDF MoM dikirim ke grup Telegram departemen setiap peserta."}</p>
      {groupLinks.length > 0 && <ul className={css.groupLinks} aria-label="Grup Telegram">{groupLinks.map(group => <li key={group.title}>
        <a href={group.url!} target="_blank" rel="noopener">{group.title} <ExternalLink size={14} aria-hidden /><span className="sr-only"> (buka di Telegram)</span></a>
      </li>)}</ul>}
      <p>Grupnya dipilih otomatis dari departemen setiap peserta di Data karyawan. Peserta lain juga diberi tahu di WAM.</p>
      <h3>Cara masuk grup Telegram</h3>
      <ol>
        <li>{groupLinks.length ? "Ketuk nama grup di atas untuk membuka undangannya." : "Buka tautan undangan grup departemen Anda dari panitia atau admin WAM. Belum punya? Minta ke mereka."}</li>
        <li>Tekan <strong>Gabung</strong> (Join Group).</li>
        <li>Selesai. Setiap MoM masuk sendiri ke topik <strong>📝 MoM</strong> di grup itu, tanpa perlu dibagikan lagi.</li>
      </ol>
      <p>Setelah dikirim, MoM masih bisa diubah; pesannya di Telegram ikut diganti tanpa bunyi.</p>
    </div>;
  }

  /**
   * Saves the form's content; with `send`, after asking where it goes. A draft is also sent straight
   * from reading it (12 Nov 2026): the same content, sent.
   */
  async function save(send: boolean, content: Draft | null = draft) {
    if (!content) return;
    const problem = itemsProblem(content.items);
    if (problem) { setError(problem); setStep(frm && attendees.length ? 2 : 1); return; }
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
        method: "PUT", json: { items, ...form, actions, send, telegramOff: content.telegramOff, docNumber: content.docNumber.trim() },
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
  const photoBlock = (editable: boolean) => frm && <MinutePhotos sessionId={sessionId} photos={view.photos} editable={editable && canWrite} ready={view.photosReady} hd={view.photoHd} onChange={setPhotos} />;

  if (!view.migrated) return <section className={css.panel} aria-label="Notulen">{heading}<p className={styles.hint}>Notulen belum bisa ditulis.</p></section>;

  if (draft) {
    const away = new Set(draft.absentIds);
    const here = attendees.filter(person => !away.has(person.id)).length;
    // Every topic is in III (13 Nov 2026: the form has no IV; the PDF still has the form's IV).
    const agenda = draft.items.map((item, index) => ({ item, index }));
    const room = draft.items.length < minutesLimits.items;
    /*
     * On a phone (12 Nov 2026) the form is a few steps, one screen each, with Kembali, Simpan draf and
     * Lanjut at the bottom; on a larger screen every part shows at once, with its buttons at the end.
     */
    const steps = [
      { key: "info", label: "Info" },
      ...(frm && attendees.length ? [{ key: "hadir", label: "Hadir" }] : []),
      { key: "bahasan", label: "Bahasan" },
      { key: "tindak", label: "Tindak lanjut" },
      { key: "selesai", label: "Selesai" },
    ];
    const at = Math.min(step, steps.length - 1);
    const last = at === steps.length - 1;
    const part = (key: string) => ({ hidden: phone && key !== steps[at].key ? true : undefined });
    const go = (to: number) => {
      setStep(Math.max(0, Math.min(steps.length - 1, to)));
      formTop.current?.scrollIntoView?.({ block: "start", behavior: "smooth" });
    };
    const cancel = () => { setDraft(null); setError(null); };
    const primary = drafts && !sent ? <><Send size={18} aria-hidden /> {busy === "send" ? "Mengirim…" : "Kirim MoM"}</> : busy ? "Menyimpan…" : sent ? "Simpan perubahan" : "Simpan notulen";
    const topics = draft.items.filter(filled).length;
    const tasks = draft.actions.filter(action => action.task.trim()).length;
    /** An agenda item (III) or a new topic (IV): topic, discussion summary and decisions. */
    const itemEditor = ({ item, index }: { item: MinuteItem; index: number }, number: number, removable: boolean) => {
      const where = "agenda item";
      return <li key={index} className={css.item}>
        <div className={css.cardHead}>
          <span className={css.cardTitle}><span className={css.itemNo}>{number}</span> Agenda {number}</span>
          {removable && <button type="button" className={css.remove} aria-label={`Hapus agenda ${number}`}
            onClick={() => patch({ items: draft.items.filter((_, at) => at !== index) })}><Trash2 size={18} aria-hidden /></button>}
        </div>
        <div>
          <label className={css.fieldLabel} htmlFor={`${uid}-topic-${index}`}>Topic/Agenda Item</label>
          <input id={`${uid}-topic-${index}`} className="input" aria-label={`Topic/Agenda Item ${number}`} value={item.topic} maxLength={minutesLimits.topic}
            placeholder="Judul agenda" onChange={event => setItem(index, { topic: event.target.value })} />
        </div>
        <div>
          <label className={css.fieldLabel} htmlFor={`${uid}-discussion-${index}`}>Discussion Summary &amp; Key Points</label>
          <textarea id={`${uid}-discussion-${index}`} className="textarea" rows={4} aria-label={`Discussion Summary & Key Points, ${where} ${number}`} maxLength={minutesLimits.text}
            value={item.discussion} placeholder="Apa yang dibahas dan poin pentingnya" onChange={event => setItem(index, { discussion: event.target.value })} />
        </div>
        <div>
          <label className={css.fieldLabel} htmlFor={`${uid}-decision-${index}`}>Decisions/Outcomes</label>
          <textarea id={`${uid}-decision-${index}`} className="textarea" rows={3} aria-label={`Decisions/Outcomes, ${where} ${number}`} maxLength={minutesLimits.decision}
            value={item.decision} placeholder="Yang disepakati, satu per baris" onChange={event => setItem(index, { decision: event.target.value })} />
        </div>
      </li>;
    };
    return <section className={css.panel} aria-label="Notulen">
      {heading}
      <form ref={formTop} className={css.form} onSubmit={event => {
        event.preventDefault();
        // Enter in a field on a phone moves on a step; it sends only from the last one.
        if (phone && !last) { go(at + 1); return; }
        void save(drafts && !sent);
      }}>
        {phone && <ol className={css.stepper} aria-label="Langkah mengisi MoM">
          {steps.map((each, index) => <li key={each.key}>
            <button type="button" aria-current={index === at ? "step" : undefined} data-done={index < at ? "" : undefined} onClick={() => go(index)}>
              <span className={css.stepNo}>{index + 1}</span><span>{each.label}</span>
            </button>
          </li>)}
        </ol>}

        <fieldset className={css.group} {...part("info")}>
          <legend className={css.groupTitle}>{sectionTitle("I.", "MEETING INFORMATION")}</legend>
          <MeetingFacts view={view} taker={minutes?.submittedBy ?? "Yang pertama menyimpan"} number={<>
            <dt className={css.wide}><label htmlFor={`${uid}-number`}>MoM Number</label></dt>
            <dd className={css.wide}><div className={css.numberField}>
              <input id={`${uid}-number`} className="input" value={draft.docNumber} maxLength={MOM_DOC_NUMBER_MAX} autoComplete="off"
                placeholder={minutes?.number ?? "Nomor surat MoM"} onChange={event => patch({ docNumber: event.target.value })} />
              <a className="button button--secondary" href={MOM_NUMBER_REGISTER} target="_blank" rel="noopener">Ambil nomor <ExternalLink size={16} aria-hidden /><span className="sr-only"> (tab baru)</span></a>
            </div></dd>
          </>} chair={frm && <>
            <dt className={css.wide}><label htmlFor={`${uid}-chair`}>Chairperson</label></dt>
            <dd className={css.wide}><select id={`${uid}-chair`} className="select" value={draft.chairId ?? ""} onChange={event => patch({ chairId: event.target.value || null })}>
              <option value="">Belum dipilih</option>
              {people.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}
            </select></dd>
          </>} />
        </fieldset>

        {frm && attendees.length > 0 && <fieldset className={css.group} {...part("hadir")}>
          <legend className={css.groupTitle}>{sectionTitle("II.", "ATTENDANCE", <span className={css.groupCount}>{here} present · {attendees.length - here} absent</span>)}</legend>
          <p className={styles.hint}>Centang yang hadir. Saat MoM disimpan, kehadiran ini langsung tercatat sebagai absen mereka.</p>
          <ul className={css.people}>{attendees.map(person => <li key={person.id}>
            <label className={css.check}>
              <input type="checkbox" checked={!away.has(person.id)} disabled={selfCheckedIn(person)}
                onChange={event => patch({ absentIds: event.target.checked ? draft.absentIds.filter(id => id !== person.id) : [...draft.absentIds, person.id] })} />
              <span>{person.fullName}<small>{[person.department, person.frmPosition || person.position, selfCheckedIn(person) ? "sudah absen sendiri" : person.checkedIn ? "tercatat hadir" : null].filter(Boolean).join(" · ") || "Data karyawan belum lengkap"}</small></span>
            </label>
          </li>)}</ul>
          <GuestPicker id={`${uid}-guests`} value={draft.guests} staff={view.staff ?? []} taken={attendees.map(person => person.id)} onChange={guests => patch({ guests })} />
        </fieldset>}

        <fieldset className={css.group} {...part("bahasan")}>
          <legend className={css.groupTitle}>{sectionTitle("III.", "AGENDA ITEMS AND DISCUSSION")}</legend>
          <ol className={css.items}>{agenda.map((entry, at) => itemEditor(entry, at + 1, agenda.length > 1))}</ol>
          {room && <button type="button" className="button button--secondary" onClick={() => patch({ items: [...draft.items, blankItem()] })}><Plus size={18} aria-hidden /> Tambah agenda</button>}
        </fieldset>

        <fieldset className={css.group} {...part("tindak")}>
          <legend className={css.groupTitle}>{sectionTitle("V.", "ACTION ITEMS")}</legend>
          <p className={css.note}>{ACTIONS_NOTE}</p>
          <ol className={css.actionRows}>{draft.actions.map((action, index) => <li key={action.id ?? `new-${index}`} className={css.actionRow}>
            <div className={css.cardHead}>
              <span className={css.cardTitle}><span className={css.itemNo}>{index + 1}</span> Tindak lanjut {index + 1}</span>
              <button type="button" className={css.remove} aria-label={`Hapus tindak lanjut ${index + 1}`} onClick={() => patch({ actions: draft.actions.filter((_, at) => at !== index) })}><Trash2 size={18} aria-hidden /></button>
            </div>
            <label className={css.actionField}><span className={css.fieldLabel}>Action Item/Task</span>
              {/* A text box that wraps, so the whole task shows while typing; one line (Enter adds none). */}
              <textarea className="textarea" rows={2} aria-label={`Action Item/Task ${index + 1}`} value={action.task} maxLength={minutesLimits.task} placeholder="Apa yang harus dikerjakan"
                onKeyDown={event => { if (event.key === "Enter") event.preventDefault(); }}
                onChange={event => setAction(index, { task: event.target.value.replace(/\s*\n\s*/g, " ") })} /></label>
            <div className={css.actionMeta}>
            <label className={css.actionField}><span className={css.fieldLabel}>PIC</span>
              <select className="select" aria-label={`PIC ${index + 1}`} value={action.picId ?? ""} onChange={event => setAction(index, { picId: event.target.value || null })}>
                <option value="">Pilih PIC</option>
                {people.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}
              </select></label>
            <label className={css.actionField}><span className={css.fieldLabel}>Due Date (tenggat)</span>
              <input className="input" type="date" aria-label={`Due Date ${index + 1}`} value={action.dueDate ?? ""} onChange={event => setAction(index, { dueDate: event.target.value || null })} /></label>
            </div>
          </li>)}</ol>
          {draft.actions.length < minutesLimits.actions && <button type="button" className="button button--secondary" onClick={() => patch({ actions: [...draft.actions, blankAction()] })}><Plus size={18} aria-hidden /> Tambah tindak lanjut</button>}
        </fieldset>

        {frm && <fieldset className={css.group} {...part("selesai")}>
          <legend className={css.groupTitle}>{sectionTitle("VI.", "NEXT MEETING", <span className={css.groupCount}>isi kalau ada</span>)}</legend>
          <div className={css.nextGrid}>
            <div><label className={styles.label} htmlFor={`${uid}-next-date`}>Date</label>
              <input id={`${uid}-next-date`} className="input" type="date" value={draft.next.date ?? ""} onChange={event => setNext({ date: event.target.value || null })} /></div>
            <div><label className={styles.label} htmlFor={`${uid}-next-time`}>Time</label>
              <input id={`${uid}-next-time`} className="input" type="time" value={draft.next.time ?? ""} onChange={event => setNext({ time: event.target.value || null })} /></div>
          </div>
          <div><label className={styles.label} htmlFor={`${uid}-next-place`}>Location/Platform</label>
            <input id={`${uid}-next-place`} className="input" maxLength={minutesLimits.place} value={draft.next.place} placeholder="Ruang rapat, Zoom, atau lainnya" onChange={event => setNext({ place: event.target.value })} /></div>
          <div><label className={styles.label} htmlFor={`${uid}-next-agenda`}>Draft Agenda Items</label>
            <textarea id={`${uid}-next-agenda`} className="textarea" rows={2} maxLength={minutesLimits.agenda} value={draft.next.agenda} placeholder="Yang akan dibahas" onChange={event => setNext({ agenda: event.target.value })} /></div>
        </fieldset>}

        {!phone && frm && attendees.length > 0 && <fieldset className={css.group}>
          <legend className={css.groupTitle}>{sectionTitle("VII.", "ATTENDANCE LIST")}</legend>
          <AttendanceList attendees={attendees} absentIds={draft.absentIds} guests={draft.guests} />
        </fieldset>}

        <div className={css.stepPart} {...part("selesai")}>
          {photoBlock(true)}
          {/* What is filled, before it goes (a phone shows one part at a time). */}
          {phone && <ul className={css.ready} aria-label="Isi MoM">
            <li>{topics} topik dibahas</li>
            <li>{tasks} tindak lanjut</li>
            {frm && attendees.length > 0 && <li>{here} dari {attendees.length} hadir</li>}
            {frm && <li>{view.photos.length} foto</li>}
          </ul>}
          {drafts && <label className={css.check}>
            <input type="checkbox" checked={!draft.telegramOff} onChange={event => {
              if (!event.target.checked) { patch({ telegramOff: true }); return; }
              // Like agreeing to terms: read to the end, then Kirim ke Telegram; Batalkan leaves it off.
              void (async () => {
                if (await confirm({ title: "Kirim ke Telegram", body: telegramTerms(), confirmLabel: "Kirim ke Telegram", cancelLabel: "Batalkan", mustRead: true })) patch({ telegramOff: false });
              })();
            }} />
            <span>Kirim ke Telegram<small>Centang untuk mengirim PDF MoM ke grup Telegram departemen peserta. Biarkan kosong untuk meeting yang sensitif.</small></span>
          </label>}

          {drafts && <p className={styles.hint}>{sent ? "Perubahan menggantikan MoM yang sudah dikirim." : "Draf hanya terlihat oleh yang ikut meeting sampai MoM dikirim."}</p>}
        </div>
        {error && <Notice tone="error">{error}</Notice>}
        {!phone && <div className={css.buttons}>
          <button type="button" className="button button--secondary" disabled={busy !== null} onClick={cancel}>Batal</button>
          {drafts && !sent && <button type="button" className="button button--secondary" disabled={busy !== null} onClick={() => { void save(false); }}>{busy === "draft" ? "Menyimpan…" : "Simpan draf"}</button>}
          <button type="submit" className="button button--primary" disabled={busy !== null}>{primary}</button>
        </div>}
        {phone && <div className={css.stepBar}>
          <button key="kembali" type="button" className="button button--secondary" disabled={busy !== null} onClick={() => (at === 0 ? cancel() : go(at - 1))}>{at === 0 ? "Batal" : "Kembali"}</button>
          {drafts && !sent && <button key="draf" type="button" className={`button button--secondary ${css.draftButton}`} disabled={busy !== null} onClick={() => { void save(false); }}>{busy === "draft" ? "Menyimpan…" : "Simpan draf"}</button>}
          {/* Separate keys: React must not turn the tapped Lanjut into the submit button of the last step (it would send at once). */}
          {last ? <button key="kirim" type="submit" className="button button--primary" disabled={busy !== null}>{primary}</button>
            : <button key="lanjut" type="button" className="button button--primary" onClick={event => { event.preventDefault(); go(at + 1); }}>Lanjut <ChevronRight size={18} aria-hidden /></button>}
        </div>}
      </form>
      {confirmDialog}
    </section>;
  }

  const failed = telegram.deliveries.filter(item => item.status === "gagal");
  const delivered = telegram.deliveries.filter(item => item.status === "terkirim");
  const items = minutes ? minutesItems(minutes) : [];

  // Who came is kept from the FRM form on (a MoM with a number).
  const { present, absent } = presence(attendees, minutes?.absentIds ?? []);
  const showPresence = frm && !!minutes?.number && attendees.length > 0;
  const next = minutes?.next;
  /** Agenda items or new topics, as read. */
  const readItems = (list: typeof items) => <ol className={css.readItems}>{list.map((item, index) => <li key={index}>
    <p className={css.readTopic}><span className={css.itemNo}>{index + 1}</span> {item.topic}{item.added && <span className={`${styles.pill} ${styles.pillLine}`}>Topik baru</span>}</p>
    {item.discussion && <p className={css.text}>{item.discussion}</p>}
    {item.decision && <p className={css.decision}><strong>Decisions/Outcomes:</strong> {item.decision}</p>}
  </li>)}</ol>;
  return <section className={css.panel} aria-label="Notulen">
    {heading}
    {notice && <p role="status" className={css.saved}><CheckCircle2 size={16} aria-hidden /> {notice}</p>}
    {minutes ? <>
      {!sent && <Notice tone="info">Masih draf. Peserta lain bisa membacanya setelah MoM dikirim.</Notice>}
      <section className={css.group}>
        <h3 className={css.groupTitle}>{sectionTitle("I.", "MEETING INFORMATION")}</h3>
        <MeetingFacts view={view} number={minutes.docNumber ?? minutes.number ?? "-"} taker={minutes.submittedBy ?? "Peserta"}
          chair={frm && <><dt>Chairperson</dt><dd>{minutes.chairName ?? "-"}</dd></>} />
      </section>
      {showPresence && <section className={css.group}>
        <h3 className={css.groupTitle}>{sectionTitle("II.", "ATTENDANCE", <span className={css.groupCount}>{present.length} present · {absent.length} absent</span>)}</h3>
        <dl className={css.facts}>
          <dt>Present</dt><dd>{[...present.map(person => person.fullName), ...guestNames(minutes.guests)].join(", ") || "-"}</dd>
          <dt>Absent</dt><dd>{absent.map(person => person.fullName).join(", ") || "-"}</dd>
        </dl>
      </section>}
      <section className={css.group}>
        <h3 className={css.groupTitle}>{sectionTitle("III.", "AGENDA ITEMS AND DISCUSSION")}</h3>
        {items.length ? readItems(items) : <p className={css.text}>-</p>}
      </section>
      <section className={css.group}>
        <h3 className={css.groupTitle}>{sectionTitle("V.", "ACTION ITEMS")}</h3>
        {minutes.actions.length ? <ul className={css.actionList}>{minutes.actions.map(action => {
          const mayTick = sent && (canWrite || action.picId === view.viewerId);
          const text = <span className={css.actionText}>
            <span className={action.done ? css.done : undefined}>{action.task}</span>
            <small>{[action.picName ? `PIC ${action.picName}` : "PIC belum dipilih", action.dueDate ? `Due ${frmDue(action.dueDate)}` : null, action.done ? "Done" : "Open"].filter(Boolean).join(" · ")}</small>
          </span>;
          return <li key={action.id ?? action.task}>
            {mayTick ? <label className={css.actionItem}><input type="checkbox" checked={action.done} onChange={event => { void tick(action, event.target.checked); }} />{text}</label>
              : <div className={css.actionItem}><span className={css.bullet} aria-hidden>{action.done ? "✓" : "•"}</span>{text}</div>}
          </li>;
        })}</ul> : <p className={styles.hint}>Tidak ada tindak lanjut.</p>}
      </section>
      {frm && <section className={css.group}>
        <h3 className={css.groupTitle}>{sectionTitle("VI.", "NEXT MEETING")}</h3>
        <dl className={css.facts}>
          <dt>Date</dt><dd>{next?.date ? frmDate(next.date) : "-"}</dd>
          <dt>Time</dt><dd>{next?.time ? frmTime(next.time) : "-"}</dd>
          <dt>Location/Platform</dt><dd>{next?.place || "-"}</dd>
          <dt>Draft Agenda Items</dt><dd>{next?.agenda || "-"}</dd>
        </dl>
      </section>}
      {showPresence && <section className={css.group}>
        <h3 className={css.groupTitle}>{sectionTitle("VII.", "ATTENDANCE LIST")}</h3>
        <AttendanceList attendees={attendees} absentIds={minutes.absentIds} guests={minutes.guests ?? ""} />
      </section>}
      {photoBlock(true)}
      <p className={styles.hint}>
        {sent && minutes.sentAt ? `Dikirim ${minutes.sentBy ?? minutes.submittedBy ?? "peserta"} · ${stamp(minutes.sentAt)}` : `Ditulis ${minutes.submittedBy ?? "peserta"} · ${stamp(minutes.submittedAt)}`}
        {minutes.updatedAt !== minutes.submittedAt && minutes.updatedBy ? ` · diubah ${minutes.updatedBy}, ${stamp(minutes.updatedAt)}` : ""}
      </p>
      {sent && drafts && (minutes.telegramOff || delivered.length > 0 || failed.length > 0) && <div className={css.telegram}>
        {minutes.telegramOff ? <p>Tidak dikirim ke Telegram.</p>
          : delivered.length > 0 && <p>Terkirim ke Telegram: {delivered.map((item, index) => {
            const url = groupLinks.find(group => group.title === item.title)?.url;
            return <span key={item.title}>{index ? ", " : ""}{url ? <a href={url} target="_blank" rel="noopener">{item.title}</a> : item.title}</span>;
          })}</p>}
        {!minutes.telegramOff && failed.length > 0 && <p className={css.warn}>Belum terkirim ke {failed.map(item => item.title).join(", ")}. Dicoba lagi saat MoM disimpan berikutnya.</p>}
      </div>}
    </> : <>
      <p className={styles.hint}>{status === "belum" ? "Meeting sudah selesai, notulennya belum diisi." : status === "draf" ? "Notulen sedang ditulis." : view.open ? "Belum ada notulen." : "Notulen bisa ditulis setelah meeting dimulai."}</p>
      {canWrite && photoBlock(true)}
    </>}
    {error && <Notice tone="error">{error}</Notice>}
    {(minutes || canWrite) && <div className={`${css.buttons} ${css.readBar}`}>
      {minutes && <a className="button button--secondary" href={minutesApi.pdf(sessionId)} download><Download size={18} aria-hidden /> Unduh PDF</a>}
      {canWrite && <button type="button" className={`button ${minutes ? "button--secondary" : "button--primary"}`} onClick={start}>
        <NotebookPen size={18} aria-hidden /> {!minutes ? "Tulis notulen" : sent ? "Ubah notulen" : "Lanjutkan draf"}
      </button>}
      {/* A draft that is ready goes without opening the form again. */}
      {canWrite && minutes && !sent && drafts && <button type="button" className={`button button--primary ${css.readMain}`} disabled={busy !== null} onClick={() => { void save(true, draftOf()); }}>
        <Send size={18} aria-hidden /> {busy === "send" ? "Mengirim…" : "Kirim MoM"}
      </button>}
    </div>}
    {confirmDialog}
  </section>;
}
