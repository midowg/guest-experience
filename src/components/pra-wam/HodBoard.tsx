"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { CalendarClock, Check, Clock, MapPin, Plus, Users, X } from "lucide-react";
import { Notice } from "@/components/ui";
import { clockLabel, dayLabel, wibDate, wibTime } from "@/lib/pra-wam/appraisal";
import { hodResponseLabels, hodStatusLabels, hodTimes, sortMeetings, type HodDepartment, type HodMeeting } from "@/lib/pra-wam/hod";
import { praWamApi } from "@/lib/routes";
import { errorText, praWamRequest } from "./api";
import { ScreenHead } from "./ScreenHead";
import { Sheet } from "./Sheet";
import styles from "./pra-wam.module.css";
import css from "./hod.module.css";

type Props = {
  meetings: HodMeeting[]; departments: HodDepartment[]; viewerId: string;
  /** The departments this HOD leads: not offered to invite (they are already there). */
  ownUnits: string[];
  migrated: boolean;
  /** When the page was drawn, so server and browser sort the same way. */
  now: string;
};

const span = (meeting: HodMeeting) => `${dayLabel(wibDate(meeting.startsAt))} · ${clockLabel(wibTime(meeting.startsAt))}–${clockLabel(wibTime(meeting.endsAt))}`;

/**
 * Meeting HOD (6 Nov 2026), for HODs only: what waits for your answer, what is coming (scheduled,
 * or still waiting for other HODs), and the history. "Ajukan meeting" asks the HODs of the
 * departments picked; each answers here, and the meeting is scheduled once all accept.
 */
export function HodBoard({ meetings, departments, viewerId, ownUnits, migrated, now }: Props) {
  const router = useRouter();
  const [formOpen, setFormOpen] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const { toAnswer, upcoming, history } = sortMeetings(meetings, viewerId, new Date(now));

  const done = (text: string) => { setNotice({ tone: "success", text }); router.refresh(); };
  const failed = (error: unknown) => setNotice({ tone: "error", text: errorText(error) });

  const list = (items: HodMeeting[], empty?: string) => items.length
    ? <ul className={css.list}>{items.map(meeting => <li key={meeting.id}><MeetingCard meeting={meeting} viewerId={viewerId} now={now} onDone={done} onError={failed} /></li>)}</ul>
    : empty ? <p className={css.empty}>{empty}</p> : null;

  return <>
    <ScreenHead title="Meeting HOD"
      actions={migrated ? <button type="button" className="button button--primary" onClick={() => setFormOpen(true)} aria-haspopup="dialog"><Plus size={18} aria-hidden /> Ajukan meeting</button> : undefined} />
    {!migrated && <Notice tone="warning">Meeting HOD menunggu migrasi 202611060001_pra_wam_hod_meetings.sql.</Notice>}
    {notice && <div className={css.notice}><Notice tone={notice.tone}>{notice.text}</Notice></div>}

    {toAnswer.length > 0 && <>
      <p className={styles.sectionLabel}>Perlu jawabanmu</p>
      {list(toAnswer)}
    </>}
    <p className={styles.sectionLabel}>Akan datang</p>
    {list(upcoming, "Belum ada meeting HOD yang akan datang.")}
    {history.length > 0 && <>
      <p className={styles.sectionLabel}>Riwayat</p>
      {list(history)}
    </>}

    <MeetingForm open={formOpen} onClose={() => setFormOpen(false)} departments={departments} ownUnits={ownUnits}
      onSaved={text => { setFormOpen(false); done(text); }} />
  </>;
}

/** One meeting: when and where, who asked, each invited HOD's answer, and what this HOD can do. */
function MeetingCard({ meeting, viewerId, now, onDone, onError }: {
  meeting: HodMeeting; viewerId: string; now: string; onDone: (text: string) => void; onError: (error: unknown) => void;
}) {
  const uid = useId();
  const [busy, setBusy] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [note, setNote] = useState("");
  const mine = meeting.invites.find(invite => invite.id === viewerId);
  const past = new Date(meeting.endsAt) <= new Date(now);
  const canAnswer = meeting.status === "menunggu" && !past && mine?.response === "menunggu";
  const canCancel = meeting.requester.id === viewerId && !past && (meeting.status === "menunggu" || meeting.status === "terjadwal");
  const accepted = meeting.invites.filter(invite => invite.response === "terima").length;

  async function run(call: () => Promise<{ message: string }>) {
    setBusy(true);
    try { onDone((await call()).message); } catch (error) { onError(error); } finally { setBusy(false); }
  }
  const answer = (accept: boolean) => run(() => praWamRequest(praWamApi.hodMeetings(meeting.id), { method: "POST", json: { accept, note: accept ? "" : note } }));
  const cancel = () => { if (window.confirm(`Batalkan "${meeting.title}"? HOD yang diundang akan diberi tahu.`)) void run(() => praWamRequest(praWamApi.hodMeetings(meeting.id), { method: "DELETE" })); };

  return <article className={`${css.card} ${past || meeting.status === "batal" || meeting.status === "ditolak" ? css.quiet : ""}`} aria-labelledby={`${uid}-title`}>
    <header className={css.cardHead}>
      <h3 id={`${uid}-title`}>{meeting.title}</h3>
      <span className={`${css.status} ${css[meeting.status]}`}>{past && meeting.status === "terjadwal" ? "Selesai" : hodStatusLabels[meeting.status]}</span>
    </header>
    <dl className={css.facts}>
      <div><dt><Clock size={16} aria-label="Waktu" /></dt><dd>{span(meeting)}</dd></div>
      {meeting.place && <div><dt><MapPin size={16} aria-label="Tempat" /></dt><dd>{meeting.place}</dd></div>}
      <div><dt><Users size={16} aria-label="Diajukan oleh" /></dt><dd>{meeting.requester.id === viewerId ? "Kamu" : meeting.requester.name}{meeting.requester.unit ? ` · ${meeting.requester.unit}` : ""}</dd></div>
    </dl>
    {meeting.agenda && <p className={css.agenda}>{meeting.agenda}</p>}

    <div className={css.invites}>
      <p className={css.invitesHead}>HOD diundang <span>{accepted} dari {meeting.invites.length} menerima</span></p>
      <ul>
        {meeting.invites.map(invite => <li key={invite.id} className={css[invite.response]}>
          <span className={css.mark} aria-hidden>{invite.response === "terima" ? <Check size={14} /> : invite.response === "tolak" ? <X size={14} /> : <CalendarClock size={14} />}</span>
          <span className={css.who}><strong>{invite.id === viewerId ? "Kamu" : invite.name}</strong><small>{invite.unit}</small></span>
          <span className={css.answer}>{hodResponseLabels[invite.response]}</span>
          {invite.note && <q className={css.note}>{invite.note}</q>}
        </li>)}
      </ul>
    </div>

    {canAnswer && (declining
      ? <div className={css.decline}>
        <label className={styles.label} htmlFor={`${uid}-note`}>Alasan menolak (boleh kosong)</label>
        <textarea id={`${uid}-note`} className="textarea" rows={2} maxLength={300} value={note} onChange={event => setNote(event.target.value)} placeholder="Mis. bentrok dengan rapat klien, usul hari Kamis" />
        <div className={css.actions}>
          <button type="button" className="button button--secondary" onClick={() => setDeclining(false)} disabled={busy}>Kembali</button>
          <button type="button" className="button button--danger" onClick={() => void answer(false)} disabled={busy}>{busy ? "Mengirim…" : "Kirim penolakan"}</button>
        </div>
      </div>
      : <div className={css.actions}>
        <button type="button" className="button button--secondary" onClick={() => setDeclining(true)} disabled={busy}>Tolak</button>
        <button type="button" className="button button--primary" onClick={() => void answer(true)} disabled={busy}><Check size={18} aria-hidden /> {busy ? "Mengirim…" : "Terima"}</button>
      </div>)}
    {canCancel && <div className={css.actions}><button type="button" className={`button button--secondary ${css.cancel}`} onClick={cancel} disabled={busy}>Batalkan meeting</button></div>}
  </article>;
}

/** Ajukan meeting: title, date and hours, place, the departments whose HODs are asked, and the agenda. */
function MeetingForm({ open, onClose, departments, ownUnits, onSaved }: {
  open: boolean; onClose: () => void; departments: HodDepartment[]; ownUnits: string[]; onSaved: (text: string) => void;
}) {
  const uid = useId();
  const today = wibDate(new Date().toISOString());
  const [draft, setDraft] = useState({ title: "", date: today, start: "10:00", end: "11:00", place: "", agenda: "", unitIds: [] as string[] });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (patch: Partial<typeof draft>) => { setDraft(current => ({ ...current, ...patch })); setError(""); };
  const offered = departments.filter(department => !ownUnits.includes(department.id));
  const toggle = (id: string) => set({ unitIds: draft.unitIds.includes(id) ? draft.unitIds.filter(item => item !== id) : [...draft.unitIds, id] });
  const pickable = offered.filter(department => department.heads.length > 0);
  const allOn = pickable.length > 0 && pickable.every(department => draft.unitIds.includes(department.id));

  async function save() {
    if (draft.title.trim().length < 2) { setError("Tulis judul meeting."); return; }
    if (!draft.unitIds.length) { setError("Pilih minimal satu departemen."); return; }
    if (draft.end <= draft.start) { setError("Jam selesai harus setelah jam mulai."); return; }
    setSaving(true);
    try {
      const { message } = await praWamRequest(praWamApi.hodMeetings(), { method: "POST", json: draft });
      setDraft({ title: "", date: today, start: "10:00", end: "11:00", place: "", agenda: "", unitIds: [] });
      onSaved(message);
    } catch (problem) { setError(errorText(problem)); } finally { setSaving(false); }
  }

  return <Sheet open={open} onClose={onClose} title="Ajukan meeting HOD" subtitle="HOD departemen yang dipilih menerima undangan dan menjawabnya."
    footer={<>
      <button type="button" className="button button--secondary" onClick={onClose} disabled={saving}>Batal</button>
      <button type="button" className="button button--primary" onClick={() => void save()} disabled={saving}>{saving ? "Mengirim…" : "Kirim undangan"}</button>
    </>}>
    <div className={css.form}>
      {error && <Notice tone="error">{error}</Notice>}
      <div>
        <label className={styles.label} htmlFor={`${uid}-title`}>Judul</label>
        <input id={`${uid}-title`} className="input" value={draft.title} maxLength={120} placeholder="Mis. Sinkronisasi target Q1" onChange={event => set({ title: event.target.value })} />
      </div>
      <div className={css.when}>
        <div>
          <label className={styles.label} htmlFor={`${uid}-date`}>Tanggal</label>
          <input id={`${uid}-date`} className="input" type="date" min={today} value={draft.date} onChange={event => set({ date: event.target.value })} />
        </div>
        <div>
          <label className={styles.label} htmlFor={`${uid}-start`}>Mulai</label>
          <select id={`${uid}-start`} className="select" value={draft.start} onChange={event => set({ start: event.target.value })}>
            {hodTimes.slice(0, -1).map(time => <option key={time} value={time}>{clockLabel(time)}</option>)}
          </select>
        </div>
        <div>
          <label className={styles.label} htmlFor={`${uid}-end`}>Selesai</label>
          <select id={`${uid}-end`} className="select" value={draft.end} onChange={event => set({ end: event.target.value })}>
            {hodTimes.slice(1).map(time => <option key={time} value={time}>{clockLabel(time)}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className={styles.label} htmlFor={`${uid}-place`}>Tempat</label>
        <input id={`${uid}-place`} className="input" value={draft.place} maxLength={120} placeholder="Mis. Nagapadma, atau Zoom" onChange={event => set({ place: event.target.value })} />
      </div>
      <fieldset className={css.departments}>
        <legend className={styles.label}>Departemen yang diundang</legend>
        {pickable.length > 1 && <label className={css.all}>
          <input type="checkbox" checked={allOn} onChange={() => set({ unitIds: allOn ? [] : pickable.map(department => department.id) })} />
          <span>Pilih semua departemen ({pickable.length})</span>
        </label>}
        <ul>
          {offered.map(department => {
            const none = department.heads.length === 0;
            return <li key={department.id}>
              <label className={`${css.department} ${none ? css.disabled : ""}`}>
                <input type="checkbox" checked={draft.unitIds.includes(department.id)} disabled={none} onChange={() => toggle(department.id)} />
                <span><strong>{department.name}</strong><small>{none ? "Belum ada HOD" : department.heads.map(head => head.name).join(", ")}</small></span>
              </label>
            </li>;
          })}
        </ul>
      </fieldset>
      <div>
        <label className={styles.label} htmlFor={`${uid}-agenda`}>Agenda (boleh kosong)</label>
        <textarea id={`${uid}-agenda`} className="textarea" rows={3} maxLength={1000} value={draft.agenda} onChange={event => set({ agenda: event.target.value })} />
      </div>
    </div>
  </Sheet>;
}
