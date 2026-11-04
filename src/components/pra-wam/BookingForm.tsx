"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Check, Clock, DoorOpen, Info, Pencil, Send, Users } from "lucide-react";
import { Button, Notice } from "@/components/ui";
import {
  alternatives, appraisalRules, bookingProblems, clockLabel, clockMinutes, dayLabel, durationLabel, durationsFrom, minutesClock,
  slotTimes, titleSuggestions, wibDate, wibInstant, type Booking, type Person, type Room,
} from "@/lib/pra-wam/appraisal";
import { praWamApi, praWamPath } from "@/lib/routes";
import { roomStatus, type PlanTone } from "@/lib/pra-wam/floor-plan";
import { headcount, peopleLabel, roomFit } from "@/lib/pra-wam/room-fit";
import { errorText, praWamRequest, PraWamApiError, type Conflict } from "./api";
import { FloorPlan } from "./FloorPlan";
import own from "./appraisal.module.css";
import css from "./booking-form.module.css";
import styles from "./pra-wam.module.css";

/** A chip in the participant picker: a department or BU and its people. */
export type PeopleGroup = { id: string; label: string; memberIds: string[] };
export type BookingDraft = { date: string; start: string; end: string; roomId: string; title: string; description: string; participants: string[] };
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
};

const STEPS = ["Waktu", "Kegiatan", "Partisipan", "Ruang"] as const;
const SUMMARY = STEPS.length;
/** Which step holds each field, so an error (ours or the server's) opens the right one. */
const FIELD_STEP: Record<string, number> = { date: 0, start: 0, end: 0, title: 1, description: 1, participants: 2, roomId: 3 };

const chipDay = (date: string) => new Intl.DateTimeFormat("id-ID", { weekday: "short", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
const chipDate = (date: string) => new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
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
 */
export function BookingForm({ editId, initial, dates, now, rooms, people, viewer, groups, usedTitles, dayBookings, dayOf, onSaved, frame, showPlan = true }: Props) {
  const router = useRouter();
  const [draft, setDraft] = useState(initial);
  const [step, setStep] = useState(editId ? SUMMARY : 0);
  // The furthest step reached; once the summary has been seen, Lanjut goes back to it.
  const [furthest, setFurthest] = useState(editId ? SUMMARY : 0);
  const [bookings, setBookings] = useState(dayBookings);
  const [loadedDate, setLoadedDate] = useState(dayOf ?? initial.date);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const uid = useId();
  const formId = `${uid}-form`;
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [groupId, setGroupId] = useState(groups[0]?.id ?? "");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [conflict, setConflict] = useState<(Conflict & { message: string }) | null>(null);
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
  const slots = slotTimes();
  const startsOn = (date: string) => slots.slice(0, -1).filter(time => new Date(wibInstant(date, time)) > nowDate);
  const starts = startsOn(draft.date);
  const length = clockMinutes(draft.end) - clockMinutes(draft.start);
  const lengths = durationsFrom(draft.start);
  const chosen = { startsAt: wibInstant(draft.date, draft.start), endsAt: wibInstant(draft.date, draft.end) };
  const hours = `${clockLabel(draft.start)}–${clockLabel(draft.end)}`;

  // Until another day's bookings arrive, rooms are not marked free or taken from the wrong day.
  const dayKnown = loadedDate === draft.date;
  const others = dayKnown ? bookings.filter(booking => booking.id !== editId) : [];
  const guests = new Set(draft.participants.filter(id => id !== viewer.id));
  const count = headcount(guests.size);
  const bookable = rooms.filter(room => room.bookable);
  const fitting = bookable.filter(room => roomFit(room, count).ok);

  function choiceOf(room: Room): Choice {
    const fit = roomFit(room, count);
    if (!fit.ok) return { ok: false, pending: false, tone: "off", text: fit.text };
    if (!dayKnown) return { ok: false, pending: true, tone: "closed", text: "Memuat jadwal…" };
    const status = roomStatus({
      bookable: room.bookable, span: chosen, now: nowDate,
      holds: others.filter(booking => booking.roomId === room.id).map(booking => ({ startsAt: booking.startsAt, endsAt: booking.endsAt, mine: !booking.isSession && booking.bookedBy.id === viewer.id })),
    });
    return { ok: status.tone === "free", pending: false, tone: status.tone, text: status.text };
  }
  const choices = bookable.map(room => ({ room, ...choiceOf(room) }));
  const listed = [...choices.filter(item => item.ok), ...choices.filter(item => !item.ok)];
  // A room from the link or the booking being changed stays picked only while it still suits.
  const wanted = rooms.find(room => room.id === draft.roomId);
  const wantedChoice = wanted ? choiceOf(wanted) : null;
  const roomId = wantedChoice?.ok ? draft.roomId : "";
  const room = rooms.find(item => item.id === roomId);
  const dropped = wanted && wantedChoice && !wantedChoice.ok && !wantedChoice.pending ? `${wanted.name} tidak bisa dipakai: ${wantedChoice.text.charAt(0).toLowerCase()}${wantedChoice.text.slice(1)}. Pilih ruang lain.` : null;
  const anyFree = choices.some(item => item.ok);
  // When nothing is free at those hours: the nearest free hours in the rooms that suit.
  const freeTimes = !dayKnown || anyFree ? [] : fitting.flatMap(item => {
    const option = alternatives({ roomId: item.id, date: draft.date, start: draft.start, end: draft.end }, rooms, others, nowDate, editId).sameRoom[0];
    return option ? [{ room: item, ...option }] : [];
  }).sort((a, b) => Math.abs(clockMinutes(a.start) - clockMinutes(draft.start)) - Math.abs(clockMinutes(b.start) - clockMinutes(draft.start))).slice(0, 3);

  const suggestions = useMemo(() => titleSuggestions(draft.title, usedTitles), [draft.title, usedTitles]);
  const group = groups.find(item => item.id === groupId);
  const picked = draft.participants.map(id => people.find(person => person.id === id)).filter((person): person is Person => !!person);
  const query = search.trim().toLowerCase();
  const offered = people.filter(person => person.id !== viewer.id && !draft.participants.includes(person.id) && (query ? person.name.toLowerCase().includes(query) : !!group?.memberIds.includes(person.id))).slice(0, 40);
  const full = guests.size >= appraisalRules.maxParticipants;
  const countLine = guests.size ? `Kamu + ${guests.size} orang = ${peopleLabel(count)}` : "Kamu saja = 1 orang";

  /** Keeps the length when the start moves, shortened only to end by closing. */
  function hoursFrom(start: string) {
    const options = durationsFrom(start);
    const keep = options.includes(length) ? length : options.filter(item => item <= Math.max(length, appraisalRules.stepMinutes)).at(-1) ?? options[0] ?? appraisalRules.stepMinutes;
    return { start, end: minutesClock(clockMinutes(start) + keep) };
  }
  function pickDate(date: string) {
    const open = startsOn(date);
    set({ date, ...(open.includes(draft.start) || !open.length ? {} : hoursFrom(open[0])) });
  }
  function chooseTitle(title: string) { set({ title }); setSuggestOpen(false); setActive(-1); }
  function onTitleKey(event: React.KeyboardEvent) {
    if (!suggestOpen || !suggestions.length) return;
    if (event.key === "ArrowDown") { event.preventDefault(); setActive((active + 1) % suggestions.length); }
    else if (event.key === "ArrowUp") { event.preventDefault(); setActive(active <= 0 ? suggestions.length - 1 : active - 1); }
    else if (event.key === "Enter" && active >= 0) { event.preventDefault(); chooseTitle(suggestions[active]); }
    else if (event.key === "Escape") setSuggestOpen(false);
  }
  function addPeople(ids: string[]) {
    set({ participants: [...draft.participants, ...ids].slice(0, appraisalRules.maxParticipants) });
  }
  function pickRoom(item: Room) {
    if (!choiceOf(item).ok) return;
    set({ roomId: item.id });
  }

  /** What stops a step, as field errors; empty when Lanjut may go on. */
  function problemsOf(at: number): Record<string, string> {
    if (at === 0) return bookingProblems(draft, new Date());
    if (at === 1) return draft.title.trim().length < 2 ? { title: "Isi nama kegiatan." } : {};
    if (at === 2) return guests.size > appraisalRules.maxParticipants ? { participants: `Paling banyak ${appraisalRules.maxParticipants} partisipan.` } : {};
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
    const target = field === "start" ? `${uid}-start` : field === "end" ? `${uid}-length` : field === "title" ? `${uid}-title` : "";
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
    setFieldErrors({});
    setBusy(true);
    try {
      const body = { ...draft, roomId, confirmed };
      const result = await praWamRequest(editId ? praWamApi.bookings(editId) : praWamApi.bookings(), { method: editId ? "PATCH" : "POST", json: body });
      if (onSaved) { setBusy(false); onSaved({ message: result.message, date: draft.date }); return; }
      router.refresh(); router.push(praWamPath.appraisal(draft.date));
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

    {error && <Notice tone="error">{error}</Notice>}

    <section {...stepProps(0)}>
      {heading(0, "Kapan?")}
      <div className={styles.dates} role="group" aria-label="Tanggal">
        {dates.map(day => <button key={day} type="button" className={`${styles.chip} ${styles.chipStack}`} aria-pressed={day === draft.date} onClick={() => pickDate(day)}>
          {chipDay(day)}<small>{chipDate(day)}{day === wibDate(now) ? " · hari ini" : ""}</small>
        </button>)}
      </div>
      {fieldError("date")}
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
      {starts.length === 0 && <Notice tone="info">Jam operasional hari ini sudah lewat. Pilih tanggal lain.</Notice>}
      <p className={styles.hint}>Jam operasional {clockLabel(appraisalRules.open)}–{clockLabel(appraisalRules.close)}, 30 menit sampai 4 jam.</p>
    </section>

    <section {...stepProps(1)}>
      {heading(1, "Kegiatan apa?")}
      <div className={styles.suggest}>
        <label className={styles.label} htmlFor={`${uid}-title`}>Nama kegiatan</label>
        <input id={`${uid}-title`} className="input" value={draft.title} maxLength={120} autoComplete="off" placeholder="Mis. Appraisal 1-on-1"
          role="combobox" aria-expanded={suggestOpen && suggestions.length > 0} aria-controls={`${uid}-suggestions`} aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${uid}-title-${active}` : undefined} aria-invalid={!!fieldErrors.title} aria-describedby={described("title")}
          onChange={event => { set({ title: event.target.value }); setSuggestOpen(true); setActive(-1); }}
          onFocus={() => setSuggestOpen(true)} onBlur={() => setTimeout(() => setSuggestOpen(false), 120)} onKeyDown={onTitleKey} />
        {suggestOpen && suggestions.length > 0 && <ul id={`${uid}-suggestions`} className={styles.suggestList} role="listbox" aria-label="Saran nama kegiatan">
          {suggestions.map((title, index) => <li key={title} id={`${uid}-title-${index}`} role="option" aria-selected={index === active} onMouseDown={event => { event.preventDefault(); chooseTitle(title); }}>{title}</li>)}
        </ul>}
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
      <p className={css.headcount} role="status"><Users size={18} aria-hidden />{countLine}</p>
      <p className={styles.hint}>{fitting.length
        ? `${fitting.length} ruang cocok untuk ${peopleLabel(count)}.`
        : `Belum ada ruang untuk ${peopleLabel(count)}. Kurangi atau tambah partisipan.`}</p>
      {picked.length > 0 && <div className={styles.picked} aria-label="Partisipan terpilih">
        {picked.map(person => <span key={person.id} className={`${styles.chip} ${styles.chipSmall} ${styles.pickedChip}`}>
          {person.name}<button type="button" className={styles.chipRemove} aria-label={`Hapus ${person.name}`} onClick={() => set({ participants: draft.participants.filter(id => id !== person.id) })}>×</button>
        </span>)}
      </div>}
      <div>
        <label className={styles.label} htmlFor={`${uid}-search`}>Cari nama</label>
        <input id={`${uid}-search`} className="input" type="search" value={search} placeholder="Ketik nama, atau pilih departemen di bawah" onChange={event => setSearch(event.target.value)}
          onKeyDown={event => {
            // Enter picks the one name found rather than leaving the step.
            if (event.key !== "Enter") return;
            event.preventDefault();
            if (query && offered.length === 1 && !full) { addPeople([offered[0].id]); setSearch(""); }
          }} />
      </div>
      {!query && <div className={styles.dates} role="group" aria-label="Departemen dan BU">
        {groups.map(item => <button key={item.id} type="button" className={`${styles.chip} ${styles.chipSmall}`} aria-pressed={item.id === groupId} onClick={() => setGroupId(item.id)}>{item.label}</button>)}
      </div>}
      {!query && group && offered.length > 1 && <button type="button" className="button button--quiet" disabled={full}
        onClick={() => addPeople(offered.map(person => person.id))}>Tambah semua {group.label} ({offered.length})</button>}
      <div className={styles.people} aria-label="Saran partisipan">
        {offered.length === 0 && <p className={styles.meta}>{query ? "Nama tidak ditemukan." : "Semua di departemen ini sudah dipilih."}</p>}
        {offered.map(person => <button key={person.id} type="button" className={`${styles.chip} ${styles.chipSmall}`} disabled={full}
          onClick={() => { addPeople([person.id]); setSearch(""); }}>+ {person.name}{query && <span className={styles.meta}> · {person.department}</span>}</button>)}
      </div>
      {full && <p className={styles.hint}>Paling banyak {appraisalRules.maxParticipants} partisipan.</p>}
      {fieldError("participants")}
    </section>

    <section {...stepProps(3)}>
      {heading(3, "Di ruang mana?")}
      <p className={css.lead}>{peopleLabel(count)} · {dayLabel(draft.date)} {hours}</p>
      {!dayKnown && (loadError
        ? <Notice tone="error">{loadError} <button type="button" className="button button--quiet" onClick={() => setReload(reload + 1)}>Coba lagi</button></Notice>
        : <p className={styles.meta} role="status">Memuat jadwal ruang {dayLabel(draft.date)}…</p>)}
      {dropped && <p className={css.note} role="status">{dropped}</p>}
      {dayKnown && !anyFree && <div className={css.wayOut} role="status">
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
      {showPlan
        ? step === 3 && <FloorPlan rooms={rooms} selectedId={roomId} onPick={pickRoom}
          statusOf={item => item.bookable ? choiceOf(item) : { tone: "off", text: "Tidak bisa dibooking" }} legendLabels={{ off: "Tidak cocok / tidak bisa dibooking" }}
          label={`Denah kantor untuk ${peopleLabel(count)}, ${dayLabel(draft.date)} ${hours}`}
          caption={room ? <span role="status">{room.name} dipilih</span> : "Ketuk ruang yang kosong di denah."}
          legend={["free", "selected", "busy", "mine", "off"]} />
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
      {showPlan && room && <p className={css.picked}>{room.name} · {capacityText(room)}</p>}
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
          {peopleLabel(count)}<small>{picked.length ? `Kamu, ${picked.map(person => person.name).join(", ")}` : "Hanya kamu"}</small>
        </SummaryRow>
        <SummaryRow label="Ruang" onEdit={() => goTo(3)}>
          {room ? <>{room.name}<small>{capacityText(room)}</small></> : <span className={css.missing}>{dayKnown ? "Belum dipilih" : "Memuat jadwal…"}</span>}
        </SummaryRow>
      </dl>
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
      <p className={own.info}><Info size={16} aria-hidden />Booking langsung pasti. Bila ruang keburu dipesan orang lain, isianmu tetap tersimpan dan kami tawarkan jam atau ruang lain.</p>
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
