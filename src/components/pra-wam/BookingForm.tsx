"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { DoorOpen, Info, Send } from "lucide-react";
import { Button, Notice } from "@/components/ui";
import { appraisalRules, bookingProblems, clockLabel, dayLabel, overlaps, slotTimes, titleSuggestions, wibDate, wibInstant, wibTime, type Booking, type Person, type Room } from "@/lib/pra-wam/appraisal";
import { praWamApi, praWamPath } from "@/lib/routes";
import { roomStatus } from "@/lib/pra-wam/floor-plan";
import { errorText, praWamRequest, PraWamApiError, type Conflict } from "./api";
import { FloorPlan } from "./FloorPlan";
import own from "./appraisal.module.css";
import styles from "./pra-wam.module.css";

/** A chip in the participant picker: a department or BU and its people. */
export type PeopleGroup = { id: string; label: string; memberIds: string[] };
export type BookingDraft = { date: string; start: string; end: string; roomId: string; title: string; description: string; participants: string[] };
type Props = {
  editId?: string; initial: BookingDraft; dates: string[]; now: string; rooms: Room[]; people: Person[];
  viewer: { id: string }; groups: PeopleGroup[]; usedTitles: { title: string; count: number }[]; dayBookings: Booking[];
};

const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
const span = (booking: Pick<Booking, "startsAt" | "endsAt">) => `${clockLabel(wibTime(booking.startsAt))}–${clockLabel(wibTime(booking.endsAt))}`;
const chipDay = (date: string) => new Intl.DateTimeFormat("id-ID", { weekday: "short", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
const chipDate = (date: string) => new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));

/**
 * Book ruang, as cards in the look of Penpot's "P9 · Ajukan ganti jadwal" (the page adds the back
 * row and title). The room is picked on the office floor plan, with the room cards below as a list;
 * `rooms` holds every room, the ones that cannot be booked drawn grey. Rooms show at once whether
 * they are free at the chosen hours; the server
 * still has the last word, and when someone else saved first the form keeps everything that was
 * typed and offers the nearest free hour or another room.
 */
export function BookingForm({ editId, initial, dates, now, rooms, people, viewer, groups, usedTitles, dayBookings }: Props) {
  const router = useRouter();
  const [draft, setDraft] = useState(initial);
  const [bookings, setBookings] = useState(dayBookings);
  const [loadedDate, setLoadedDate] = useState(initial.date);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [groupId, setGroupId] = useState(groups[0]?.id ?? "");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [conflict, setConflict] = useState<(Conflict & { message: string }) | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const set = (patch: Partial<BookingDraft>) => { setDraft(current => ({ ...current, ...patch })); setConflict(null); };

  // The day's bookings follow the chosen date.
  useEffect(() => {
    if (draft.date === loadedDate) return;
    let stale = false;
    praWamRequest<{ bookings: Booking[] }>(praWamApi.bookings(undefined, { date: draft.date }))
      .then(result => { if (!stale) { setBookings(result.data.bookings); setLoadedDate(draft.date); } })
      .catch(problem => { if (!stale) setError(errorText(problem)); });
    return () => { stale = true; };
  }, [draft.date, loadedDate]);

  const nowDate = new Date(now);
  const slots = slotTimes();
  const starts = slots.slice(0, -1).filter(time => new Date(wibInstant(draft.date, time)) > nowDate);
  const ends = slots.filter(time => minutes(time) > minutes(draft.start) && minutes(time) - minutes(draft.start) <= appraisalRules.maxMinutes);
  const chosen = { startsAt: wibInstant(draft.date, draft.start), endsAt: wibInstant(draft.date, draft.end) };
  const others = bookings.filter(booking => booking.id !== editId);
  const takenBy = (room: Room) => others.find(booking => booking.roomId === room.id && overlaps(booking, chosen));
  const bookable = rooms.filter(room => room.bookable);
  const statusOf = (room: Room) => roomStatus({
    bookable: room.bookable, span: chosen, now: nowDate,
    holds: others.filter(booking => booking.roomId === room.id).map(booking => ({ startsAt: booking.startsAt, endsAt: booking.endsAt, mine: !booking.isSession && booking.bookedBy.id === viewer.id })),
  });
  const suggestions = useMemo(() => titleSuggestions(draft.title, usedTitles), [draft.title, usedTitles]);
  const group = groups.find(item => item.id === groupId);
  const picked = draft.participants.map(id => people.find(person => person.id === id)).filter((person): person is Person => !!person);
  const query = search.trim().toLowerCase();
  const offered = people.filter(person => person.id !== viewer.id && !draft.participants.includes(person.id) && (query ? person.name.toLowerCase().includes(query) : !!group?.memberIds.includes(person.id))).slice(0, 40);

  function pickStart(start: string) {
    const length = Math.max(minutes(draft.end) - minutes(draft.start), appraisalRules.stepMinutes);
    const endAt = Math.min(minutes(start) + length, minutes(appraisalRules.close));
    set({ start, end: `${String(Math.floor(endAt / 60)).padStart(2, "0")}:${String(endAt % 60).padStart(2, "0")}` });
  }
  function chooseTitle(title: string) { set({ title }); setSuggestOpen(false); setActive(-1); }
  function onTitleKey(event: React.KeyboardEvent) {
    if (!suggestOpen || !suggestions.length) return;
    if (event.key === "ArrowDown") { event.preventDefault(); setActive((active + 1) % suggestions.length); }
    else if (event.key === "ArrowUp") { event.preventDefault(); setActive(active <= 0 ? suggestions.length - 1 : active - 1); }
    else if (event.key === "Enter" && active >= 0) { event.preventDefault(); chooseTitle(suggestions[active]); }
    else if (event.key === "Escape") setSuggestOpen(false);
  }

  async function save(confirmed = false) {
    setError(null); setFieldErrors({}); setConflict(null);
    const local: Record<string, string> = { ...bookingProblems(draft, new Date()) };
    if (draft.title.trim().length < 2) local.title = "Isi nama kegiatan.";
    if (!draft.roomId) local.roomId = "Pilih ruang.";
    if (Object.keys(local).length) { setFieldErrors(local); if (local.title) titleRef.current?.focus(); return; }
    setBusy(true);
    try {
      const body = { ...draft, confirmed };
      await praWamRequest(editId ? praWamApi.bookings(editId) : praWamApi.bookings(), { method: editId ? "PATCH" : "POST", json: body });
      router.refresh(); router.push(praWamPath.appraisal(draft.date));
    } catch (problem) {
      if (problem instanceof PraWamApiError && problem.conflict) {
        setConflict({ ...problem.conflict, message: problem.message });
        if (problem.conflict.kind === "room") praWamRequest<{ bookings: Booking[] }>(praWamApi.bookings(undefined, { date: draft.date })).then(result => setBookings(result.data.bookings)).catch(() => undefined);
      } else if (problem instanceof PraWamApiError && problem.fieldErrors) {
        setFieldErrors(Object.fromEntries(Object.entries(problem.fieldErrors).map(([key, list]) => [key, list[0]])));
        setError(problem.message);
      } else setError(errorText(problem));
      setBusy(false);
    }
  }

  const roomName = (id: string) => rooms.find(room => room.id === id)?.name ?? "Ruang";
  return <form className={styles.form} onSubmit={event => { event.preventDefault(); void save(); }} noValidate>
    {error && <Notice tone="error">{error}</Notice>}

    <section className={`${styles.card} ${own.formCard}`} aria-labelledby="kegiatan">
      <h2 id="kegiatan">Kegiatan</h2>
      <div className={styles.suggest}>
        <label className={styles.label} htmlFor="title">Nama kegiatan</label>
        <input ref={titleRef} id="title" className="input" value={draft.title} maxLength={120} autoComplete="off" placeholder="Mis. Appraisal 1-on-1"
          role="combobox" aria-expanded={suggestOpen && suggestions.length > 0} aria-controls="title-suggestions" aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `title-${active}` : undefined} aria-invalid={!!fieldErrors.title}
          onChange={event => { set({ title: event.target.value }); setSuggestOpen(true); setActive(-1); }}
          onFocus={() => setSuggestOpen(true)} onBlur={() => setTimeout(() => setSuggestOpen(false), 120)} onKeyDown={onTitleKey} />
        {suggestOpen && suggestions.length > 0 && <ul id="title-suggestions" className={styles.suggestList} role="listbox" aria-label="Saran nama kegiatan">
          {suggestions.map((title, index) => <li key={title} id={`title-${index}`} role="option" aria-selected={index === active} onMouseDown={event => { event.preventDefault(); chooseTitle(title); }}>{title}</li>)}
        </ul>}
        {fieldErrors.title && <p className={styles.error}>{fieldErrors.title}</p>}
      </div>
      <div>
        <label className={styles.label} htmlFor="description">Deskripsi <span className={styles.meta}>(opsional)</span></label>
        <textarea id="description" className="textarea" rows={3} maxLength={500} value={draft.description} onChange={event => set({ description: event.target.value })} />
        <p className={styles.hint}><span className={own.counter}>{draft.description.length}/500</span> · Hanya terlihat oleh kamu, partisipan, dan panitia.</p>
      </div>
    </section>

    <section className={`${styles.card} ${own.formCard}`} aria-labelledby="waktu">
      <h2 id="waktu">Tanggal dan jam</h2>
      <div className={styles.dates} role="group" aria-label="Tanggal">
        {dates.map(day => <button key={day} type="button" className={`${styles.chip} ${styles.chipStack}`} aria-pressed={day === draft.date} onClick={() => set({ date: day })}>
          {chipDay(day)}<small>{chipDate(day)}{day === wibDate(now) ? " · hari ini" : ""}</small>
        </button>)}
      </div>
      {fieldErrors.date && <p className={styles.error}>{fieldErrors.date}</p>}
      <div className={styles.times}>
        <div>
          <label className={styles.label} htmlFor="start">Mulai</label>
          <select id="start" className="select" value={draft.start} aria-invalid={!!fieldErrors.start} onChange={event => pickStart(event.target.value)}>
            {!starts.includes(draft.start) && <option value={draft.start} disabled>{clockLabel(draft.start)}</option>}
            {starts.map(time => <option key={time} value={time}>{clockLabel(time)}</option>)}
          </select>
          {fieldErrors.start && <p className={styles.error}>{fieldErrors.start}</p>}
        </div>
        <div>
          <label className={styles.label} htmlFor="end">Sampai</label>
          <select id="end" className="select" value={draft.end} aria-invalid={!!fieldErrors.end} onChange={event => set({ end: event.target.value })}>
            {!ends.includes(draft.end) && <option value={draft.end} disabled>{clockLabel(draft.end)}</option>}
            {ends.map(time => <option key={time} value={time}>{clockLabel(time)} ({minutes(time) - minutes(draft.start)} menit)</option>)}
          </select>
          {fieldErrors.end && <p className={styles.error}>{fieldErrors.end}</p>}
        </div>
      </div>
      {starts.length === 0 && <Notice tone="info">Jam operasional hari ini sudah lewat. Pilih tanggal lain.</Notice>}
      <p className={styles.hint}>Jam operasional {clockLabel(appraisalRules.open)}–{clockLabel(appraisalRules.close)}, paling lama 4 jam.</p>
    </section>

    <section className={`${styles.card} ${own.formCard}`} aria-labelledby="ruang">
      <h2 id="ruang">Ruang</h2>
      <FloorPlan rooms={rooms} statusOf={statusOf} selectedId={draft.roomId} onPick={room => set({ roomId: room.id })}
        label={`Denah kantor, ${dayLabel(draft.date)} ${clockLabel(draft.start)}–${clockLabel(draft.end)}`}
        caption={draft.roomId ? <span role="status">{roomName(draft.roomId)} dipilih</span> : "Ketuk ruang yang kosong di denah, atau pilih dari daftar."}
        legend={["free", "selected", "busy", "mine", "off"]} />
      <p className={own.roomList}>Daftar ruang</p>
      <div className={styles.rooms}>
        {bookable.map(room => {
          const taken = takenBy(room);
          return <button key={room.id} type="button" className={`${styles.roomOption} ${styles.row}`} style={{ display: "flex" }} aria-pressed={draft.roomId === room.id} disabled={!!taken} onClick={() => set({ roomId: room.id })}>
            <span className={styles.tile}><DoorOpen aria-hidden /></span>
            <span className={own.stack}>
              <strong>{room.name}</strong>
              {taken ? <span className={`${styles.status} ${styles.busy}`}>Dipakai {taken.isSession ? "sesi" : taken.bookedBy.name}, {span(taken)}</span>
                : <span className={`${styles.status} ${styles.free}`}>Kosong {clockLabel(draft.start)}–{clockLabel(draft.end)}</span>}
              <span className={styles.meta}>{room.capacity ? `Kapasitas ${room.capacity} orang` : "Kapasitas belum diisi"}</span>
            </span>
          </button>;
        })}
      </div>
      {fieldErrors.roomId && <p className={styles.error}>{fieldErrors.roomId}</p>}
    </section>

    <section className={`${styles.card} ${own.formCard}`} aria-labelledby="partisipan">
      <h2 id="partisipan">Partisipan <span className={styles.meta}>({picked.length}/{appraisalRules.maxParticipants})</span></h2>
      {picked.length > 0 && <div className={styles.picked} aria-label="Partisipan terpilih">
        {picked.map(person => <span key={person.id} className={`${styles.chip} ${styles.chipSmall} ${styles.pickedChip}`}>
          {person.name}<button type="button" className={styles.chipRemove} aria-label={`Hapus ${person.name}`} onClick={() => set({ participants: draft.participants.filter(id => id !== person.id) })}>×</button>
        </span>)}
      </div>}
      <div>
        <label className={styles.label} htmlFor="search">Cari nama</label>
        <input id="search" className="input" type="search" value={search} placeholder="Ketik nama, atau pilih departemen di bawah" onChange={event => setSearch(event.target.value)} />
      </div>
      {!query && <div className={styles.dates} role="group" aria-label="Departemen dan BU">
        {groups.map(item => <button key={item.id} type="button" className={`${styles.chip} ${styles.chipSmall}`} aria-pressed={item.id === groupId} onClick={() => setGroupId(item.id)}>{item.label}</button>)}
      </div>}
      {!query && group && offered.length > 1 && <button type="button" className="button button--quiet" disabled={picked.length >= appraisalRules.maxParticipants}
        onClick={() => set({ participants: [...draft.participants, ...offered.map(person => person.id)].slice(0, appraisalRules.maxParticipants) })}>Tambah semua {group.label} ({offered.length})</button>}
      <div className={styles.people} aria-label="Saran partisipan">
        {offered.length === 0 && <p className={styles.meta}>{query ? "Nama tidak ditemukan." : "Semua di departemen ini sudah dipilih."}</p>}
        {offered.map(person => <button key={person.id} type="button" className={`${styles.chip} ${styles.chipSmall}`} disabled={picked.length >= appraisalRules.maxParticipants}
          onClick={() => { set({ participants: [...draft.participants, person.id] }); setSearch(""); }}>+ {person.name}{query && <span className={styles.meta}> · {person.department}</span>}</button>)}
      </div>
    </section>

    {conflict && <div className={styles.conflict} role="alert">
      <h3>{conflict.kind === "room" ? "Ruang sudah diambil" : "Partisipan bentrok"}</h3>
      <p>{conflict.message}</p>
      {conflict.kind === "room" && <>
        {conflict.sameRoom?.length ? <div className={styles.actions}>{conflict.sameRoom.map(option => <button key={option.start} type="button" className={`${styles.chip} ${styles.chipSmall}`} onClick={() => set({ start: option.start, end: option.end })}>{roomName(draft.roomId)} {clockLabel(option.start)}–{clockLabel(option.end)}</button>)}</div> : <p>Tidak ada jam kosong lain di ruang ini hari itu.</p>}
        {conflict.otherRooms?.length ? <div className={styles.actions}>{conflict.otherRooms.map(id => <button key={id} type="button" className={`${styles.chip} ${styles.chipSmall}`} onClick={() => set({ roomId: id })}>{roomName(id)}, jam yang sama</button>)}</div> : null}
        <p className={styles.hint}>Isian lain tetap tersimpan di form ini.</p>
      </>}
      {conflict.kind === "participants" && <div className={styles.actions}><Button type="button" variant="secondary" disabled={busy} onClick={() => save(true)}>Tetap simpan</Button></div>}
    </div>}

    <p className={own.info}><Info size={16} aria-hidden />Booking langsung pasti. Bila ruang keburu dipesan orang lain, isianmu tetap tersimpan dan kami tawarkan jam atau ruang lain.</p>

    <div className={styles.sticky}>
      <Button type="submit" disabled={busy}><Send size={18} aria-hidden /> {busy ? "Menyimpan…" : editId ? "Simpan perubahan" : "Book ruang"}</Button>
      <span className={styles.meta}>{draft.roomId ? `${roomName(draft.roomId)} · ` : ""}{dayLabel(draft.date)} · {clockLabel(draft.start)}–{clockLabel(draft.end)}</span>
    </div>
  </form>;
}
