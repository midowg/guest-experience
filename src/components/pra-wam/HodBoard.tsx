"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { CalendarClock, Check, Clock, MapPin, Plus, Users, X } from "lucide-react";
import { Notice } from "@/components/ui";
import { clockLabel, dayLabel, durationLabel, durationsFrom, isWorkday, slotTimes, wibDate, wibInstant, wibTime, type Booking, type Room } from "@/lib/pra-wam/appraisal";
import { hodResponseLabels, hodStatusLabels, sortMeetings, type HodDepartment, type HodMeeting } from "@/lib/pra-wam/hod";
import { praWamApi } from "@/lib/routes";
import { errorText, praWamRequest } from "./api";
import { DateStrip } from "./DateStrip";
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
  /** Inside Book (a view beside Kalender and Denah): a section head instead of the screen title. */
  embedded?: boolean;
  /** The office rooms to pick as the place; with the bookings Book has loaded, a room taken at those hours says so. */
  rooms?: Room[];
  bookings?: Booking[];
};

const span = (meeting: HodMeeting) => `${dayLabel(wibDate(meeting.startsAt))} · ${clockLabel(wibTime(meeting.startsAt))}–${clockLabel(wibTime(meeting.endsAt))}`;

/**
 * Meeting HOD (6 Nov 2026), for HODs only: what waits for your answer, what is coming (scheduled,
 * or still waiting for other HODs), and the history. "Ajukan meeting" asks the HODs of the
 * departments picked; each answers here, and the meeting is scheduled once all accept.
 */
export function HodBoard({ meetings, departments, viewerId, ownUnits, migrated, now, embedded = false, rooms = [], bookings = [] }: Props) {
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
    {embedded
      ? <div className={css.head}>
        <div><h2>Meeting HOD</h2><p>Meeting antar HOD. Terjadwal setelah semua HOD yang diundang menerima.</p></div>
        {migrated && <button type="button" className="button button--secondary" onClick={() => setFormOpen(true)} aria-haspopup="dialog"><Plus size={18} aria-hidden /> Ajukan meeting</button>}
      </div>
      : <ScreenHead title="Meeting HOD"
        actions={migrated ? <button type="button" className="button button--primary" onClick={() => setFormOpen(true)} aria-haspopup="dialog"><Plus size={18} aria-hidden /> Ajukan meeting</button> : undefined} />}
    {!migrated && <Notice tone="warning">Meeting HOD menunggu migrasi 202611060001 dan 202611060002.</Notice>}
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

    <MeetingForm open={formOpen} onClose={() => setFormOpen(false)} departments={departments} ownUnits={ownUnits} rooms={rooms} bookings={bookings} now={now}
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

/** Weekdays from today for eight weeks: the days a meeting can be asked for. */
function meetingDays(today: string): string[] {
  const days: string[] = [];
  for (let day = new Date(`${today}T12:00:00Z`), at = 0; at < 56; at++, day.setUTCDate(day.getUTCDate() + 1)) {
    const date = day.toISOString().slice(0, 10);
    if (isWorkday(date)) days.push(date);
  }
  return days;
}
const minutesOf = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
const clockOf = (total: number) => `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
/** "Lainnya": a place that is not an office room (online, a client's office). */
const OTHER = "lainnya";

/**
 * Ajukan meeting, as Book ruang asks (6 Nov 2026): the day on the date strip, the start and how
 * long, then the place from the office rooms (one taken at those hours says so) or another place
 * typed in, the departments whose HODs are asked, and the agenda.
 */
function MeetingForm({ open, onClose, departments, ownUnits, rooms, bookings, now, onSaved }: {
  open: boolean; onClose: () => void; departments: HodDepartment[]; ownUnits: string[]; rooms: Room[]; bookings: Booking[]; now: string; onSaved: (text: string) => void;
}) {
  const uid = useId();
  const today = wibDate(now);
  const days = meetingDays(today);
  const startsOn = (date: string) => slotTimes().slice(0, -1).filter(time => new Date(wibInstant(date, time)) > new Date(now));
  const firstDay = days.find(day => startsOn(day).length > 0) ?? days[0];
  const fresh = () => {
    const start = startsOn(firstDay).find(time => time >= "10:00") ?? startsOn(firstDay)[0] ?? "10:00";
    return { title: "", date: firstDay, start, end: clockOf(minutesOf(start) + 60), roomId: "", place: "", agenda: "", unitIds: [] as string[] };
  };
  const [draft, setDraft] = useState(fresh);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (patch: Partial<typeof draft>) => { setDraft(current => ({ ...current, ...patch })); setError(""); };
  const offered = departments.filter(department => !ownUnits.includes(department.id));
  const toggle = (id: string) => set({ unitIds: draft.unitIds.includes(id) ? draft.unitIds.filter(item => item !== id) : [...draft.unitIds, id] });
  const pickable = offered.filter(department => department.heads.length > 0);
  const allOn = pickable.length > 0 && pickable.every(department => draft.unitIds.includes(department.id));

  const starts = startsOn(draft.date);
  const length = minutesOf(draft.end) - minutesOf(draft.start);
  const lengths = durationsFrom(draft.start);
  /** Keeps the length when the start moves, shortened only to end by closing. */
  const hoursFrom = (start: string) => {
    const options = durationsFrom(start);
    const keep = options.includes(length) ? length : options.filter(item => item <= length).at(-1) ?? options[0] ?? 30;
    return { start, end: clockOf(minutesOf(start) + keep) };
  };
  const pickDate = (date: string) => {
    const open = startsOn(date);
    set({ date, ...(open.includes(draft.start) || !open.length ? {} : hoursFrom(open[0])) });
  };
  // A room is taken when a booking or session Book has loaded overlaps these hours.
  const from = new Date(wibInstant(draft.date, draft.start)).getTime(), to = new Date(wibInstant(draft.date, draft.end)).getTime();
  const known = bookings.some(booking => wibDate(booking.startsAt) === draft.date);
  const taken = (room: Room) => bookings.some(booking => booking.roomId === room.id && new Date(booking.startsAt).getTime() < to && new Date(booking.endsAt).getTime() > from);
  const officeRooms = rooms.filter(room => room.bookable);
  const room = officeRooms.find(item => item.id === draft.roomId);

  async function save() {
    if (draft.title.trim().length < 2) { setError("Tulis judul meeting."); return; }
    if (!draft.roomId) { setError("Pilih tempat meeting."); return; }
    if (draft.roomId === OTHER && !draft.place.trim()) { setError("Tulis nama tempatnya, mis. Zoom."); return; }
    if (!draft.unitIds.length) { setError("Pilih minimal satu departemen."); return; }
    if (length <= 0) { setError("Pilih durasi."); return; }
    setSaving(true);
    try {
      const place = draft.roomId === OTHER ? draft.place.trim() : room?.name ?? "";
      const { message } = await praWamRequest(praWamApi.hodMeetings(), { method: "POST", json: { title: draft.title, date: draft.date, start: draft.start, end: draft.end, place, agenda: draft.agenda, unitIds: draft.unitIds } });
      setDraft(fresh());
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

      <DateStrip days={days} selected={draft.date} today={today} onPick={pickDate} label="Tanggal" />
      <div className={styles.times}>
        <div>
          <label className={styles.label} htmlFor={`${uid}-start`}>Jam mulai</label>
          <select id={`${uid}-start`} className="select" value={draft.start} onChange={event => set(hoursFrom(event.target.value))}>
            {!starts.includes(draft.start) && <option value={draft.start} disabled>{clockLabel(draft.start)}</option>}
            {starts.map(time => <option key={time} value={time}>{clockLabel(time)}</option>)}
          </select>
        </div>
        <div>
          <label className={styles.label} htmlFor={`${uid}-length`}>Durasi</label>
          <select id={`${uid}-length`} className="select" value={String(length)} onChange={event => set({ end: clockOf(minutesOf(draft.start) + Number(event.target.value)) })}>
            {!lengths.includes(length) && <option value={String(length)} disabled>{length > 0 ? durationLabel(length) : "Pilih durasi"}</option>}
            {lengths.map(item => <option key={item} value={String(item)}>{durationLabel(item)}</option>)}
          </select>
        </div>
      </div>
      <p className={css.span} role="status"><Clock size={18} aria-hidden />{dayLabel(draft.date)} · {clockLabel(draft.start)}–{clockLabel(draft.end)}{length > 0 ? ` (${durationLabel(length)})` : ""}</p>

      <div>
        <label className={styles.label} htmlFor={`${uid}-room`}>Tempat</label>
        <select id={`${uid}-room`} className="select" value={draft.roomId} onChange={event => set({ roomId: event.target.value })}>
          <option value="" disabled>Pilih ruangan</option>
          {officeRooms.map(item => <option key={item.id} value={item.id}>{item.name}{item.capacity ? ` · ${item.capacity} orang` : ""}{known && taken(item) ? " · terpakai di jam ini" : ""}</option>)}
          <option value={OTHER}>Lainnya (online atau tempat lain)</option>
        </select>
        {room && known && taken(room) && <p className={css.warn}>{room.name} sudah terpakai di jam ini. Pilih ruangan atau jam lain.</p>}
        {room && !known && <p className={styles.hint}>Jadwal ruangan hari ini belum dimuat di Book; pastikan ruangannya kosong di Kalender.</p>}
        {draft.roomId === OTHER && <input className="input" style={{ marginTop: 8 }} value={draft.place} maxLength={120} placeholder="Mis. Zoom, atau kantor klien" aria-label="Nama tempat" onChange={event => set({ place: event.target.value })} />}
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
