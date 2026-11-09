"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, ChartGantt, Check, CheckCircle2, Clock, DoorOpen, Info, MapPin, Pencil, Plus, Send, User, Users } from "lucide-react";
import { Button, Notice } from "@/components/ui";
import {
  alternatives, appraisalRules, bookingProblems, clockLabel, clockMinutes, dayLabel, durationLabel, durationsFrom, minutesClock,
  isWorkday, OUTSIDE_ROOM, periodAllDates, periodDates, slotTimes, titleSuggestions, wibDate, wibInstant, type Booking, type Person, type Room,
} from "@/lib/pra-wam/appraisal";
import { praWamApi, praWamPath } from "@/lib/routes";
import { roomStatus, type PlanTone } from "@/lib/pra-wam/floor-plan";
import { daySummaries, type DaySummary } from "@/lib/pra-wam/room-day";
import { headcount, isOver, largestCapacity, peopleLabel, roomFit } from "@/lib/pra-wam/room-fit";
import { errorText, praWamRequest, PraWamApiError, type Conflict } from "./api";
import { useConfirm } from "./ConfirmDialog";
import { DateStrip } from "./DateStrip";
import { dayName, TimelineMonth } from "./TimelineMonth";
import type { TimelineEntry } from "@/lib/pra-wam/timeline";
import timelineCss from "./timeline.module.css";
import { FloorPlan } from "./FloorPlan";
import { PeoplePicker, type PeopleGroup } from "./PeoplePicker";
import type { HodDepartment } from "@/lib/pra-wam/hod";
import own from "./appraisal.module.css";
import css from "./booking-form.module.css";
import styles from "./pra-wam.module.css";

export type { PeopleGroup } from "./PeoplePicker";
export type BookingDraft = { date: string; start: string; end: string; roomId: string; title: string; description: string; participants: string[]; /** For "Di luar kantor" (roomId OUTSIDE_ROOM). */ place?: string };
type Props = {
  editId?: string; initial: BookingDraft; dates: string[]; now: string; rooms: Room[]; people: Person[];
  viewer: { id: string }; groups: PeopleGroup[]; usedTitles: { title: string; count: number }[];
  /** The bookings of `dayOf` (the form's starting date unless given); another day is fetched. */
  dayBookings: Booking[]; dayOf?: string;
  /** In a sheet: after saving, instead of going back to Book. */
  onSaved?: (saved: { message: string; date: string }) => void;
  /** In a sheet: places the form and its button row (whose submit button points at the form by id). */
  frame?: (form: ReactNode, footer: ReactNode) => ReactNode;
  /** Pick the room on the office floor plan (default) or, when false, from a list of room cards. */
  showPlan?: boolean;
  /** Per weekday of the booking window: holds and "Penuh" (Book's windowSummary); without it only the chosen day is counted. */
  summary?: Record<string, DaySummary>;
  /**
   * A HOD or Lead (6 Nov 2026; Leads since 9 Nov 2026): "Booking sebagai" Pribadi or HOD/Lead under
   * Partisipan. Then departments are picked instead of people; their HODs and Leads are invited and
   * answer Terima or Tolak. The room is booked at once.
   */
  hod?: { departments: HodDepartment[]; ownUnits: string[] } | null;
  /**
   * Timeline's forums and events (9 Nov 2026), offered under Kegiatan as the activity to book for:
   * those whose dates hold the booking's day first, else the next ones. A tap fills the name.
   */
  activities?: BookingActivity[];
  /**
   * How Kapan picks the day (9 Nov 2026): "strip", the row of dates (opened from Timeline's
   * calendar, the day already picked), or "month", a month calendar (opened from Agenda, which
   * has no calendar of its own).
   */
  datePicker?: "strip" | "month";
  /** Timeline's forums and events, drawn as bars on the month picker (as on Timeline's calendar). */
  timeline?: TimelineEntry[];
};
/** A forum or event from Timeline: its name and the days it runs (or is planned for). */
export type BookingActivity = { title: string; from: string; to: string; /** Already over (it may still be picked, after a check). */ past?: boolean };

/** The activities to offer for a day: those running on it, else the next few still ahead. */
export function activitiesFor(activities: BookingActivity[], date: string): { list: BookingActivity[]; onDay: boolean } {
  const onDay = activities.filter(item => item.from <= date && item.to >= date);
  if (onDay.length) return { list: onDay, onDay: true };
  return { list: activities.filter(item => item.to >= date).slice(0, 6), onDay: false };
}

const STEPS = ["Waktu", "Kegiatan", "Partisipan", "Tempat"] as const;
const SUMMARY = STEPS.length;
/** Which step holds each field, so an error (ours or the server's) opens the right one. */
const FIELD_STEP: Record<string, number> = { date: 0, start: 0, end: 0, title: 1, description: 1, participants: 2, roomId: 3, place: 3 };

const capacityText = (room: Room) => room.capacity
  ? `Kapasitas ${room.capacity} orang${room.minPeople ? `, minimal ${room.minPeople}` : ""}`
  : room.minPeople ? `Kapasitas belum diisi, minimal ${room.minPeople}` : "Kapasitas belum diisi";

/** Whether a room can take this booking, and the line that says why (or why not). */
type Choice = { ok: boolean; pending: boolean; tone: PlanTone; text: string };

/**
 * Book ruang in four steps, then a summary: Waktu (date, start, length), Kegiatan (name and
 * description), Partisipan (who comes, counted with the booker), and Ruang, where only the rooms
 * that suit the headcount (roomFit, the rule the server repeats) and are free at those hours can be
 * picked; the rest stay visible with the reason. Each step checks itself before Lanjut, and focus
 * goes to the next step's heading. A booking being changed opens at the summary, every step one tap
 * away. The server still has the last word: when someone else saved first the form keeps everything
 * that was typed and offers the nearest free hour or another room that fits. On /wam/book/new it is
 * the page; on Book it sits in a sheet (`frame`, `onSaved`) with the buttons as the sheet's footer.
 * "Di luar kantor" (5 Nov 2026; only under Tempat since 9 Nov 2026): it opens weekends, any hour of
 * the day and more than 4 hours, so Tempat offers a way back to Waktu; the place name is typed under Tempat.
 */
export function BookingForm({ editId, initial, dates, now, rooms, people, viewer, groups, usedTitles, dayBookings, dayOf, onSaved, frame, showPlan = true, summary = {}, hod = null, activities = [], datePicker = "strip", timeline = [] }: Props) {
  const router = useRouter();
  const [draft, setDraft] = useState(initial);
  // On its own page (no sheet): saved, the form gives way to what was booked (9 Nov 2026: booking is
  // a view of its own; it no longer sends the person to Agenda).
  const [done, setDone] = useState<string | null>(null);
  // Booking as HOD: the departments picked; their HODs are the participants.
  const [asHod, setAsHod] = useState(false);
  const [hodUnits, setHodUnits] = useState<string[]>([]);
  const hodOffered = (hod?.departments ?? []).filter(department => !hod?.ownUnits.includes(department.id))
    .sort((a, b) => Number(b.heads.length > 0) - Number(a.heads.length > 0) || a.name.localeCompare(b.name, "id"));
  const hodHeads = (units: string[]) => [...new Set(hodOffered.filter(department => units.includes(department.id)).flatMap(department => department.heads.map(head => head.id)))].filter(id => id !== viewer.id);
  function pickHodUnits(units: string[]) { setHodUnits(units); set({ participants: hodHeads(units) }); }
  function chooseAs(next: boolean) {
    if (next === asHod) return;
    setAsHod(next);
    // Each way starts from its own pick: the departments' HODs, or no one.
    set({ participants: next ? hodHeads(hodUnits) : [] });
  }
  const [step, setStep] = useState(editId ? SUMMARY : 0);
  // The furthest step reached; once the summary has been seen, Lanjut goes back to it.
  const [furthest, setFurthest] = useState(editId ? SUMMARY : 0);
  const [bookings, setBookings] = useState(dayBookings);
  const [loadedDate, setLoadedDate] = useState(dayOf ?? initial.date);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const uid = useId();
  const formId = `${uid}-form`;
  // "" is Semua departemen: the whole list, narrowed by typing.
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [conflict, setConflict] = useState<(Conflict & { message: string }) | null>(null);
  const [sure, setSure] = useState(false);
  const headings = useRef<(HTMLHeadingElement | null)[]>([]);
  const moved = useRef(false);

  function set(patch: Partial<BookingDraft>) {
    setDraft(current => ({ ...current, ...patch }));
    setConflict(null);
    const cleared = Object.keys(patch).flatMap(key => key === "start" || key === "end" ? ["start", "end"] : key === "date" ? ["date", "start"] : [key]);
    setFieldErrors(current => Object.fromEntries(Object.entries(current).filter(([key]) => !cleared.includes(key))));
  }

  // The day's bookings follow the chosen date.
  useEffect(() => {
    if (draft.date === loadedDate) return;
    let stale = false;
    praWamRequest<{ bookings: Booking[] }>(praWamApi.bookings(undefined, { date: draft.date }))
      .then(result => { if (!stale) { setBookings(result.data.bookings); setLoadedDate(draft.date); setLoadError(null); } })
      .catch(problem => { if (!stale) setLoadError(errorText(problem)); });
    return () => { stale = true; };
  }, [draft.date, loadedDate, reload]);

  // A new step: its heading takes the focus, so a screen reader hears where it is.
  useEffect(() => {
    if (!moved.current) return;
    moved.current = false;
    headings.current[step]?.focus();
  }, [step]);

  const nowDate = new Date(now);
  const outside = draft.roomId === OUTSIDE_ROOM;
  const slots = slotTimes(outside);
  const startsOn = (date: string) => slots.slice(0, -1).filter(time => new Date(wibInstant(date, time)) > nowDate);
  const starts = startsOn(draft.date);
  const length = clockMinutes(draft.end) - clockMinutes(draft.start);
  const lengths = durationsFrom(draft.start, outside);
  const chosen = { startsAt: wibInstant(draft.date, draft.start), endsAt: wibInstant(draft.date, draft.end) };
  const hours = `${clockLabel(draft.start)}–${clockLabel(draft.end)}`;

  // Until another day's bookings arrive, rooms are not marked free or taken from the wrong day.
  const dayKnown = loadedDate === draft.date;
  const others = dayKnown ? bookings.filter(booking => booking.id !== editId) : [];
  const guests = new Set(draft.participants.filter(id => id !== viewer.id));
  const count = headcount(guests.size);
  const bookable = rooms.filter(room => room.bookable);
  const largest = largestCapacity(rooms);
  const fitting = bookable.filter(room => roomFit(room, count, largest).ok);
  const roomy = fitting.filter(room => !isOver(roomFit(room, count, largest)));

  function choiceOf(room: Room): Choice {
    const fit = roomFit(room, count, largest);
    if (!fit.ok) return { ok: false, pending: false, tone: "off", text: fit.text };
    if (!dayKnown) return { ok: false, pending: true, tone: "closed", text: "Memuat jadwal…" };
    const status = roomStatus({
      bookable: room.bookable, span: chosen, now: nowDate,
      holds: others.filter(booking => booking.roomId === room.id).map(booking => ({ startsAt: booking.startsAt, endsAt: booking.endsAt, mine: !booking.isSession && booking.bookedBy.id === viewer.id })),
    });
    return { ok: status.tone === "free", pending: false, tone: status.tone, text: status.tone === "free" && fit.over ? `${status.text} · melebihi kapasitas` : status.text };
  }
  const choices = bookable.map(room => ({ room, ...choiceOf(room) }));
  const listed = [...choices.filter(item => item.ok), ...choices.filter(item => !item.ok)];
  // A room from the link or the booking being changed stays picked only while it still suits.
  const wanted = rooms.find(room => room.id === draft.roomId);
  const wantedChoice = wanted ? choiceOf(wanted) : null;
  const roomId = outside ? OUTSIDE_ROOM : wantedChoice?.ok ? draft.roomId : "";
  const room = rooms.find(item => item.id === roomId);
  // The largest room taken by more than it holds: allowed after "Ya, saya yakin".
  const overRoom = !outside && room && room.capacity != null && isOver(roomFit(room, count, largest)) ? { name: room.name, capacity: room.capacity } : null;
  const dropped = wanted && wantedChoice && !wantedChoice.ok && !wantedChoice.pending ? `${wanted.name} tidak bisa dipakai: ${wantedChoice.text.charAt(0).toLowerCase()}${wantedChoice.text.slice(1)}. Pilih ruang lain.` : null;
  const anyFree = choices.some(item => item.ok);
  // When nothing is free at those hours: the nearest free hours in the rooms that suit.
  const freeTimes = !dayKnown || anyFree ? [] : fitting.flatMap(item => {
    const option = alternatives({ roomId: item.id, date: draft.date, start: draft.start, end: draft.end }, rooms, others, nowDate, editId).sameRoom[0];
    return option ? [{ room: item, ...option }] : [];
  }).sort((a, b) => Math.abs(clockMinutes(a.start) - clockMinutes(draft.start)) - Math.abs(clockMinutes(b.start) - clockMinutes(draft.start))).slice(0, 3);

  // The date strip: the whole window, past days greyed out; the chosen day recounted from its bookings.
  const today = wibDate(now);
  const stripDays = outside ? periodAllDates() : [...new Set([...periodDates(), ...dates])].sort();
  const daySummary = dayKnown
    ? { ...summary, ...daySummaries([draft.date], rooms, others.map(booking => ({ roomId: booking.roomId, startsAt: booking.startsAt, endsAt: booking.endsAt, session: booking.isSession })), nowDate) }
    : summary;
  const dayFull = !outside && draft.date >= today && !!daySummary[draft.date]?.full;

  // Nama kegiatan is picked from a list (9 Nov 2026): Timeline's forums and events (those on the
  // booking's day first), then the usual names; a booking being changed keeps its own name.
  const offered = activitiesFor(activities, draft.date);
  const fromTimeline = [...new Set([...offered.list, ...activities.filter(item => item.to >= today)].filter(item => !item.past && item.to >= today).map(item => item.title))];
  // Sessions already over (9 Nov 2026): still offered, newest first, with a check when picked.
  const pastActivities = activities.filter(item => item.past || item.to < today).sort((a, b) => b.to.localeCompare(a.to))
    .filter((item, index, list) => !fromTimeline.includes(item.title) && list.findIndex(other => other.title === item.title) === index);
  const pastTitles = pastActivities.map(item => item.title);
  const usualTitles = useMemo(() => titleSuggestions("", usedTitles, 10), [usedTitles]).filter(title => !fromTimeline.includes(title));
  const ownTitle = draft.title.trim() && !fromTimeline.includes(draft.title.trim()) && !pastTitles.includes(draft.title.trim()) && !usualTitles.includes(draft.title.trim()) ? draft.title.trim() : null;
  const [confirm, confirmDialog] = useConfirm();
  /** Picks the activity; one already over asks first (9 Nov 2026). */
  async function chooseActivity(title: string) {
    const over = pastActivities.find(item => item.title === title);
    if (over && !(await confirm({
      title: "Sesi sudah lewat",
      body: `${title} sudah berakhir ${dayLabel(over.to)}. Tetap pilih untuk booking ini?`,
      confirmLabel: "Tetap pilih",
    }))) return;
    set({ title });
  }
  const picked = draft.participants.map(id => people.find(person => person.id === id)).filter((person): person is Person => !!person);
  // Everyone but the booker can be picked.
  const colleagues = people.filter(person => person.id !== viewer.id);
  const countLine = guests.size ? `Kamu + ${guests.size} orang = ${peopleLabel(count)}` : "Kamu saja = 1 orang";

  /** Keeps the length when the start moves, shortened only to end by closing. */
  function hoursFrom(start: string, away = outside) {
    const options = durationsFrom(start, away);
    const keep = options.includes(length) ? length : options.filter(item => item <= Math.max(length, appraisalRules.stepMinutes)).at(-1) ?? options[0] ?? appraisalRules.stepMinutes;
    return { start, end: minutesClock(clockMinutes(start) + keep) };
  }
  function pickDate(date: string) {
    if (date < today) return;
    // A weekend has no rooms: picked on the month calendar, it books "Di luar kantor".
    if (!outside && !isWorkday(date)) { set({ date, roomId: OUTSIDE_ROOM }); return; }
    const open = startsOn(date);
    set({ date, ...(open.includes(draft.start) || !open.length ? {} : hoursFrom(open[0])) });
  }
  function pickRoom(item: Room) {
    if (!choiceOf(item).ok) return;
    set({ roomId: item.id });
  }
  /**
   * Ruang kantor or Di luar kantor. Back to the office, a weekend moves to the next weekday and
   * hours outside 07.00–22.00 (or longer than 4 hours) to the office's.
   */
  function chooseWhere(away: boolean) {
    if (away === outside) return;
    if (away) { set({ roomId: OUTSIDE_ROOM }); return; }
    const date = isWorkday(draft.date) ? draft.date : periodDates().find(day => day > draft.date && day >= today) ?? draft.date;
    const office = slotTimes().slice(0, -1).filter(time => new Date(wibInstant(date, time)) > nowDate);
    const keepHours = office.includes(draft.start) && durationsFrom(draft.start).includes(length);
    set({ roomId: "", date, ...(keepHours ? {} : hoursFrom(office.includes(draft.start) ? draft.start : office[0] ?? draft.start, false)) });
  }
  const whereSwitch = <div className={css.where} role="group" aria-label="Tempat">
    <button type="button" aria-pressed={!outside} onClick={() => chooseWhere(false)}><DoorOpen size={18} aria-hidden />Ruang kantor</button>
    <button type="button" aria-pressed={outside} onClick={() => chooseWhere(true)}><MapPin size={18} aria-hidden />Di luar kantor</button>
  </div>;

  /** What stops a step, as field errors; empty when Lanjut may go on. */
  function problemsOf(at: number): Record<string, string> {
    if (at === 0) return bookingProblems(draft, new Date());
    if (at === 1) return draft.title.trim().length < 2 ? { title: "Isi nama kegiatan." } : {};
    if (at === 2 && asHod && !hodUnits.length) return { participants: "Pilih minimal satu departemen." };
    if (at === 2) return {};
    if (at === 3 && outside) return (draft.place ?? "").trim().length < 2 ? { place: "Isi nama tempat." } : {};
    if (at === 3) {
      if (!dayKnown) return { roomId: "Tunggu jadwal ruang selesai dimuat." };
      if (!roomId) return { roomId: dropped ?? (anyFree ? "Pilih ruang." : "Belum ada ruang yang bisa dipilih. Ubah waktu atau partisipan.") };
    }
    return {};
  }
  const hasProblems = (at: number) => Object.keys(problemsOf(at)).length > 0;

  function goTo(to: number) {
    moved.current = true;
    setStep(to);
    setFurthest(current => Math.max(current, to));
  }
  function focusField(field: string) {
    const target = field === "start" ? `${uid}-start` : field === "end" ? `${uid}-length` : field === "title" ? `${uid}-title` : field === "place" ? `${uid}-place` : "";
    const element = target ? document.getElementById(target) : headings.current[step];
    element?.focus();
  }
  function next() {
    if (step === SUMMARY) { void save(); return; }
    const found = problemsOf(step);
    if (Object.keys(found).length) { setFieldErrors(found); focusField(Object.keys(found)[0]); return; }
    setFieldErrors({});
    let to = step + 1;
    // Back from the summary: return to it, unless a later step no longer holds (the room too small now).
    if (furthest === SUMMARY) {
      to = SUMMARY;
      for (let at = step + 1; at < SUMMARY; at++) if (hasProblems(at)) { to = at; break; }
    }
    goTo(to);
  }

  async function save(confirmed = false) {
    setError(null); setConflict(null);
    for (let at = 0; at < SUMMARY; at++) {
      const found = problemsOf(at);
      if (Object.keys(found).length) { setFieldErrors(found); goTo(at); return; }
    }
    if (overRoom && !sure) { setFieldErrors({ overCapacity: "Centang \"Ya, saya yakin\" untuk tetap memakai ruang ini." }); return; }
    setFieldErrors({});
    setBusy(true);
    try {
      const body = { ...draft, roomId, place: outside ? (draft.place ?? "").trim() : "", confirmed, overCapacity: !!overRoom && sure, ...(asHod && !editId ? { hodUnits } : {}) };
      const result = await praWamRequest(editId ? praWamApi.bookings(editId) : praWamApi.bookings(), { method: editId ? "PATCH" : "POST", json: body });
      if (onSaved) { setBusy(false); onSaved({ message: result.message, date: draft.date }); return; }
      setBusy(false); setDone(result.message); router.refresh();
      window.scrollTo({ top: 0 });
    } catch (problem) {
      if (problem instanceof PraWamApiError && problem.conflict) {
        setConflict({ ...problem.conflict, message: problem.message });
        if (problem.conflict.kind === "room") praWamRequest<{ bookings: Booking[] }>(praWamApi.bookings(undefined, { date: draft.date })).then(result => setBookings(result.data.bookings)).catch(() => undefined);
      } else if (problem instanceof PraWamApiError && problem.fieldErrors) {
        const found = Object.fromEntries(Object.entries(problem.fieldErrors).map(([key, list]) => [key, list[0]]));
        setFieldErrors(found);
        setError(problem.message);
        const at = Math.min(...Object.keys(found).map(key => FIELD_STEP[key] ?? SUMMARY));
        if (at < SUMMARY) goTo(at);
      } else setError(errorText(problem));
      setBusy(false);
    }
  }

  const roomName = (id: string) => rooms.find(item => item.id === id)?.name ?? "Ruang";
  const fieldError = (key: string) => fieldErrors[key] ? <p id={`${uid}-${key}-error`} className={styles.error}>{fieldErrors[key]}</p> : null;
  const described = (key: string) => fieldErrors[key] ? `${uid}-${key}-error` : undefined;
  const heading = (at: number, text: string) => <h2 id={`${uid}-step-${at}`} ref={element => { headings.current[at] = element; }} tabIndex={-1}>{text}</h2>;
  const stepProps = (at: number) => ({ className: `${styles.card} ${own.formCard} ${css.step}`, "aria-labelledby": `${uid}-step-${at}`, hidden: step !== at });
  const progress = step < SUMMARY ? (step + 1) / SUMMARY : 1;

  if (done) return <section className={`${styles.card} ${css.done}`} aria-labelledby={`${uid}-done`}>
    <CheckCircle2 className={css.doneIcon} aria-hidden />
    <h2 id={`${uid}-done`} tabIndex={-1} ref={element => element?.focus()}>{editId ? "Booking diubah" : "Booking tersimpan"}</h2>
    <p role="status">{done}</p>
    <dl className={css.doneFacts}>
      <div><dt>Kegiatan</dt><dd>{draft.title.trim()}</dd></div>
      <div><dt>Waktu</dt><dd>{dayLabel(draft.date)} · {hours}</dd></div>
      <div><dt>{outside ? "Tempat" : "Ruang"}</dt><dd>{outside ? (draft.place ?? "").trim() : roomName(roomId)}</dd></div>
    </dl>
    <div className={styles.actions}>
      <a className="button button--primary" href={praWamPath.timeline}><ChartGantt size={18} aria-hidden /> Kembali ke Timeline</a>
      <a className="button button--secondary" href={praWamPath.book()}><Plus size={18} aria-hidden /> Book lagi</a>
    </div>
  </section>;

  const footer = <>
    {step > 0 && <Button type="button" variant="secondary" disabled={busy} onClick={() => goTo(step - 1)}><ArrowLeft size={18} aria-hidden /> Kembali</Button>}
    <Button type="submit" form={formId} disabled={busy}>
      {step === SUMMARY
        ? <><Send size={18} aria-hidden /> {busy ? "Menyimpan…" : editId ? "Simpan perubahan" : "Book ruang"}</>
        : <>Lanjut <ArrowRight size={18} aria-hidden /></>}
    </Button>
  </>;

  const form = <form id={formId} className={styles.form} onSubmit={event => { event.preventDefault(); next(); }} noValidate>
    <div className={css.progress}>
      <p className={css.count} aria-live="polite">{step < SUMMARY ? `Langkah ${step + 1} dari ${SUMMARY} · ${STEPS[step]}` : "Ringkasan · periksa lalu simpan"}</p>
      <div className={css.bar} role="progressbar" aria-label="Kemajuan booking" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
        <span style={{ width: `${progress * 100}%` }} />
      </div>
      <ol className={css.steps} aria-label="Langkah booking">
        {STEPS.map((name, at) => <li key={name}>
          <button type="button" aria-current={at === step ? "step" : undefined} disabled={busy || at > furthest} onClick={() => goTo(at)}>
            {at < furthest && at !== step ? <Check aria-hidden /> : <span aria-hidden>{at + 1}.</span>} {name}
          </button>
        </li>)}
      </ol>
    </div>

    {confirmDialog}
    {error && <Notice tone="error">{error}</Notice>}

    <section {...stepProps(0)}>
      {heading(0, "Kapan?")}
      {datePicker === "month"
        // The month as on Timeline (9 Nov 2026): the forums' bars instead of free/full dots; a day picks the date.
        ? <div role="group" aria-label="Tanggal"><TimelineMonth entries={timeline} today={today} open={draft.date} range={{ from: appraisalRules.periodStart, to: appraisalRules.periodEnd }}
          day={(date, marks, number) => {
            const closed = date < today || date < appraisalRules.periodStart || date > appraisalRules.periodEnd;
            return <button key={date} type="button" className={`${timelineCss.calDay} ${timelineCss.calDayPick}`} {...marks} disabled={closed}
              aria-pressed={date === draft.date} aria-label={`${dayName(date)}${closed ? ", tidak bisa dipilih" : ""}`} onClick={() => pickDate(date)}>
              <span>{number}</span>
            </button>;
          }} /></div>
        : <DateStrip days={stripDays} selected={draft.date} today={today} summary={daySummary} onPick={pickDate} label="Tanggal" />}
      {fieldError("date")}
      {dayFull && <p className={css.note} role="status">Semua ruang penuh hari ini. Pilih hari lain atau jam lain.</p>}
      <div className={styles.times}>
        <div>
          <label className={styles.label} htmlFor={`${uid}-start`}>Jam mulai</label>
          <select id={`${uid}-start`} className="select" value={draft.start} aria-invalid={!!fieldErrors.start} aria-describedby={described("start")} onChange={event => set(hoursFrom(event.target.value))}>
            {!starts.includes(draft.start) && <option value={draft.start} disabled>{clockLabel(draft.start)}</option>}
            {starts.map(time => <option key={time} value={time}>{clockLabel(time)}</option>)}
          </select>
          {fieldError("start")}
        </div>
        <div>
          <label className={styles.label} htmlFor={`${uid}-length`}>Durasi</label>
          <select id={`${uid}-length`} className="select" value={String(length)} aria-invalid={!!fieldErrors.end} aria-describedby={described("end")}
            onChange={event => set({ end: minutesClock(clockMinutes(draft.start) + Number(event.target.value)) })}>
            {!lengths.includes(length) && <option value={String(length)} disabled>{length > 0 ? durationLabel(length) : "Pilih durasi"}</option>}
            {lengths.map(item => <option key={item} value={String(item)}>{durationLabel(item)}</option>)}
          </select>
          {fieldError("end")}
        </div>
      </div>
      <p className={css.span} role="status"><Clock size={18} aria-hidden />{dayLabel(draft.date)} · {hours}{length > 0 ? ` (${durationLabel(length)})` : ""}</p>
      {starts.length === 0 && <Notice tone="info">{outside ? "Hari ini sudah lewat. Pilih tanggal lain." : "Jam operasional hari ini sudah lewat. Pilih tanggal lain."}</Notice>}
      <p className={styles.hint}>{outside
        ? "Di luar kantor: boleh akhir pekan, jam berapa pun hari itu (sampai 23.30), dan lebih dari 4 jam. Nama tempat diisi di langkah Tempat."
        : `Ruang kantor ${clockLabel(appraisalRules.open)}–${clockLabel(appraisalRules.close)}, Senin–Jumat, 30 menit sampai 4 jam. Di luar kantor dipilih di langkah Tempat.`}</p>
    </section>

    <section {...stepProps(1)}>
      {heading(1, "Kegiatan apa?")}
      <div>
        <label className={styles.label} htmlFor={`${uid}-title`}>Nama kegiatan</label>
        <select id={`${uid}-title`} className="select" value={draft.title.trim()} aria-invalid={!!fieldErrors.title} aria-describedby={described("title")}
          onChange={event => { void chooseActivity(event.target.value); }}>
          <option value="" disabled>Pilih kegiatan</option>
          {ownTitle && <option value={ownTitle}>{ownTitle}</option>}
          {fromTimeline.length > 0 && <optgroup label={offered.onDay ? `Dari Timeline · ${dayLabel(draft.date)} dulu` : "Dari Timeline"}>
            {fromTimeline.map(title => <option key={title} value={title}>{title}</option>)}
          </optgroup>}
          {pastTitles.length > 0 && <optgroup label="Sudah lewat">{pastTitles.map(title => <option key={title} value={title}>{title}</option>)}</optgroup>}
          <optgroup label="Lainnya">{usualTitles.map(title => <option key={title} value={title}>{title}</option>)}</optgroup>
        </select>
        {fieldError("title")}
      </div>
      <div>
        <label className={styles.label} htmlFor={`${uid}-description`}>Deskripsi <span className={styles.meta}>(opsional)</span></label>
        <textarea id={`${uid}-description`} className="textarea" rows={3} maxLength={500} value={draft.description} aria-describedby={described("description")} onChange={event => set({ description: event.target.value })} />
        {fieldError("description")}
        <p className={styles.hint}><span className={own.counter}>{draft.description.length}/500</span> · Hanya terlihat oleh kamu, partisipan, dan panitia.</p>
      </div>
    </section>

    <section {...stepProps(2)}>
      {heading(2, "Siapa yang ikut?")}
      {hod && !editId && <div className={css.asSwitch} role="group" aria-label="Booking sebagai">
        <span className={styles.label}>Booking sebagai</span>
        <div className={css.where}>
          <button type="button" aria-pressed={!asHod} onClick={() => chooseAs(false)}><User size={18} aria-hidden />Pribadi</button>
          <button type="button" aria-pressed={asHod} onClick={() => chooseAs(true)}><Users size={18} aria-hidden />HOD/Lead</button>
        </div>
      </div>}
      <p className={css.headcount} role="status"><Users size={18} aria-hidden />{countLine}</p>
      <p className={styles.hint}>{roomy.length
        ? `${roomy.length} ruang cocok untuk ${peopleLabel(count)}.`
        : fitting.length ? `Tidak ada ruang yang muat ${peopleLabel(count)}. ${fitting.map(room => room.name).join(", ")} (terbesar, ${largest} orang) tetap bisa dipakai dengan konfirmasi.`
        : `Belum ada ruang untuk ${peopleLabel(count)}. Kurangi atau tambah partisipan.`}</p>
      {asHod ? <fieldset className={css.hodPick}>
        <legend className={styles.label}>Departemen yang diundang</legend>
        <p className={styles.hint}>HOD dan Lead departemen yang dipilih diundang dan menjawab terima atau tolak. Ruang langsung dibooking.</p>
        <ul>{hodOffered.map(department => {
          const none = department.heads.length === 0;
          return <li key={department.id}><label className={`${css.hodDept} ${none ? css.hodNone : ""}`}>
            <input type="checkbox" checked={hodUnits.includes(department.id)} disabled={none}
              onChange={() => pickHodUnits(hodUnits.includes(department.id) ? hodUnits.filter(id => id !== department.id) : [...hodUnits, department.id])} />
            <span><strong>{department.name}</strong><small>{none ? "Belum ada HOD atau Lead" : department.heads.map(head => head.post === "Lead" ? `${head.name} (Lead)` : head.name).join(", ")}</small></span>
          </label></li>;
        })}</ul>
      </fieldset> : <>
      {picked.length > 0 && <div className={styles.picked} aria-label="Partisipan terpilih">
        {picked.map(person => <span key={person.id} className={`${styles.chip} ${styles.chipSmall} ${styles.pickedChip}`}>
          {person.name}<button type="button" className={styles.chipRemove} aria-label={`Hapus ${person.name}`} onClick={() => set({ participants: draft.participants.filter(id => id !== person.id) })}>×</button>
        </span>)}
      </div>}
      <PeoplePicker people={colleagues} groups={groups} picked={draft.participants} onChange={ids => set({ participants: ids })}
        viewerId={viewer.id} />
      </>}
      {fieldError("participants")}
    </section>

    <section {...stepProps(3)}>
      {heading(3, outside ? "Di mana?" : "Di ruang mana?")}
      <p className={css.lead}>{peopleLabel(count)} · {dayLabel(draft.date)} {hours}</p>
      {whereSwitch}
      {outside && <p className={styles.hint}>Di luar kantor boleh akhir pekan, malam, dan lebih dari 4 jam. Ubah tanggal dan jamnya di langkah <button type="button" className={css.inlineLink} onClick={() => goTo(0)}>Waktu</button>.</p>}
      {outside && <div>
        <label className={styles.label} htmlFor={`${uid}-place`}>Nama tempat</label>
        <input id={`${uid}-place`} className="input" value={draft.place ?? ""} maxLength={120} autoComplete="off" placeholder="Mis. Kopi Klotok, Kaliurang"
          aria-invalid={!!fieldErrors.place} aria-describedby={described("place")} onChange={event => set({ place: event.target.value })} />
        {fieldError("place")}
        <p className={styles.hint}>Tempat di luar kantor tidak dikunci: orang lain tetap bisa memilih tempat yang sama.</p>
      </div>}
      {!outside && !dayKnown && (loadError
        ? <Notice tone="error">{loadError} <button type="button" className="button button--quiet" onClick={() => setReload(reload + 1)}>Coba lagi</button></Notice>
        : <p className={styles.meta} role="status">Memuat jadwal ruang {dayLabel(draft.date)}…</p>)}
      {!outside && dropped && <p className={css.note} role="status">{dropped}</p>}
      {!outside && dayKnown && !anyFree && <div className={css.wayOut} role="status">
        <p><strong>{fitting.length ? `Semua ruang untuk ${peopleLabel(count)} terpakai pada jam ini.` : `Belum ada ruang untuk ${peopleLabel(count)}.`}</strong></p>
        {freeTimes.length > 0 && <>
          <p>Jam terdekat yang masih kosong:</p>
          <div className={styles.actions}>{freeTimes.map(option => <button key={option.room.id} type="button" className={`${styles.chip} ${styles.chipSmall}`}
            onClick={() => set({ start: option.start, end: option.end, roomId: option.room.id })}>{option.room.name} {clockLabel(option.start)}–{clockLabel(option.end)}</button>)}</div>
        </>}
        <div className={styles.actions}>
          {fitting.length > 0 && <Button type="button" variant="secondary" onClick={() => goTo(0)}>Ubah waktu</Button>}
          <Button type="button" variant="secondary" onClick={() => goTo(2)}>Ubah partisipan</Button>
        </div>
      </div>}
      {outside ? null : showPlan
        ? step === 3 && <FloorPlan rooms={rooms} selectedId={roomId} onPick={pickRoom}
          statusOf={item => item.bookable ? choiceOf(item) : { tone: "off", text: "Tidak bisa dibooking" }} legendLabels={{ off: "Tidak cocok / tidak bisa dibooking" }}
          label={`Denah kantor untuk ${peopleLabel(count)}, ${dayLabel(draft.date)} ${hours}`}
          caption={room ? <span role="status">{room.name} dipilih</span> : "Ketuk ruang yang kosong di denah."}
          legend={["free", "selected", "busy", "mine", "off"]} subtitle="status" />
        : <div className={css.rooms} role="group" aria-label="Daftar ruang">
          {listed.map(item => <button key={item.room.id} type="button" className={css.room} aria-pressed={roomId === item.room.id} disabled={!item.ok} onClick={() => pickRoom(item.room)}>
            <span className={styles.tile}><DoorOpen aria-hidden /></span>
            <span className={own.stack}>
              <strong>{item.room.name}</strong>
              <span className={item.ok ? css.ok : css.no}>{item.text}</span>
              <span className={styles.meta}>{capacityText(item.room)}</span>
            </span>
          </button>)}
        </div>}
      {!outside && showPlan && room && <p className={css.picked}>{room.name} · {capacityText(room)}</p>}
      {fieldError("roomId")}
    </section>

    <section {...stepProps(SUMMARY)}>
      {heading(SUMMARY, "Periksa lalu simpan")}
      <dl className={css.summary}>
        <SummaryRow label="Waktu" onEdit={() => goTo(0)}>
          {dayLabel(draft.date)}<small>{hours}{length > 0 ? ` · ${durationLabel(length)}` : ""}</small>
        </SummaryRow>
        <SummaryRow label="Kegiatan" onEdit={() => goTo(1)}>
          {draft.title.trim() || <span className={css.missing}>Belum diisi</span>}{draft.description.trim() && <small>{draft.description.trim()}</small>}
        </SummaryRow>
        <SummaryRow label="Partisipan" onEdit={() => goTo(2)}>
          {peopleLabel(count)}<small>{asHod ? `Sebagai HOD/Lead · ${hodOffered.filter(department => hodUnits.includes(department.id)).map(department => department.name).join(", ")}`
            : picked.length ? `Kamu, ${picked.map(person => person.name).join(", ")}` : "Hanya kamu"}</small>
        </SummaryRow>
        <SummaryRow label="Tempat" onEdit={() => goTo(3)}>
          {outside
            ? (draft.place ?? "").trim() ? <>{(draft.place ?? "").trim()}<small>Di luar kantor</small></> : <span className={css.missing}>Nama tempat belum diisi</span>
            : room ? <>{room.name}<small>{capacityText(room)}</small></> : <span className={css.missing}>{dayKnown ? "Belum dipilih" : "Memuat jadwal…"}</span>}
        </SummaryRow>
      </dl>
      {overRoom && <div className={styles.conflict} role="alert">
        <h3>Melebihi kapasitas ruang</h3>
        <p>{overRoom.name} muat {overRoom.capacity} orang, yang ikut {peopleLabel(count)}. Apakah kamu yakin tetap memakai ruang ini?</p>
        <label className={css.sure}><input type="checkbox" checked={sure} onChange={event => { setSure(event.target.checked); setFieldErrors(({ overCapacity: _gone, ...rest }) => { void _gone; return rest; }); }} /> Ya, saya yakin</label>
        {fieldError("overCapacity")}
      </div>}
      {conflict && <div className={styles.conflict} role="alert">
        <h3>{conflict.kind === "room" ? "Ruang sudah diambil" : "Partisipan bentrok"}</h3>
        <p>{conflict.message}</p>
        {conflict.kind === "room" && <>
          {conflict.sameRoom?.length ? <div className={styles.actions}>{conflict.sameRoom.map(option => <button key={option.start} type="button" className={`${styles.chip} ${styles.chipSmall}`} onClick={() => set({ start: option.start, end: option.end })}>{roomName(draft.roomId)} {clockLabel(option.start)}–{clockLabel(option.end)}</button>)}</div> : <p>Tidak ada jam kosong lain di ruang ini hari itu.</p>}
          {(() => {
            const suited = (conflict.otherRooms ?? []).filter(id => { const other = rooms.find(item => item.id === id); return !!other && roomFit(other, count).ok; });
            return suited.length ? <div className={styles.actions}>{suited.map(id => <button key={id} type="button" className={`${styles.chip} ${styles.chipSmall}`} onClick={() => set({ roomId: id })}>{roomName(id)}, jam yang sama</button>)}</div> : null;
          })()}
          <p className={styles.hint}>Isian lain tetap tersimpan di form ini.</p>
        </>}
        {conflict.kind === "participants" && <div className={styles.actions}><Button type="button" variant="secondary" disabled={busy} onClick={() => save(true)}>Tetap simpan</Button></div>}
      </div>}
      <p className={own.info}><Info size={16} aria-hidden />{outside ? "Booking langsung masuk agenda partisipan sebagai sesi; absen dengan Saya hadir." : "Booking langsung pasti. Bila ruang keburu dipesan orang lain, isianmu tetap tersimpan dan kami tawarkan jam atau ruang lain."}</p>
    </section>

    {!frame && <div className={styles.sticky}>{footer}</div>}
  </form>;
  return frame ? frame(form, footer) : form;
}

/** One line of the summary: what was chosen, and a way back to that step. */
function SummaryRow({ label, onEdit, children }: { label: string; onEdit: () => void; children: ReactNode }) {
  return <div className={css.summaryRow}>
    <dt>{label}</dt>
    <dd>{children}</dd>
    <button type="button" className="button button--quiet" aria-label={`Ubah ${label.toLowerCase()}`} onClick={onEdit}><Pencil size={16} aria-hidden /> Ubah</button>
  </div>;
}
