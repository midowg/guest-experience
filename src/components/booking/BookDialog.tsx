"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Building2, CalendarDays, Clock, DoorOpen, Handshake, PenLine, Search, Users, X } from "lucide-react";
import { errorText, praWamRequest, type Conflict } from "@/components/pra-wam/api";
import { audienceLabels, type Audience } from "@/lib/booking/rules";
import { clockLabel, clockMinutes, dayLabel, durationLabel, durationsFrom, minutesClock, roomKeptFrom, slotTimes, wibInstant, type Person, type Room } from "@/lib/pra-wam/appraisal";
import { headcount, largestCapacity, roomFit } from "@/lib/pra-wam/room-fit";
import { bookingApi } from "@/lib/routes";
import css from "./booking.module.css";

export type BookDraft = {
  roomId: string; date: string; start: string; end: string; title: string; description: string;
  participants: string[]; audience: Audience; externalNote: string;
};

type Failure = { message: string; fields: Record<string, string[]>; conflict?: Conflict };

/**
 * The booking form, one screen: where, when, what for, for whom, who comes. The server decides
 * (and the database settles two people reaching for the same room); a refusal comes back with
 * other hours or rooms to tap.
 */
export function BookDialog({ initial, editId, rooms, dates, people, meId, departments, now, onClose, onSaved }: {
  initial: BookDraft; editId?: string; rooms: Room[]; dates: string[]; people: Person[]; meId: string; departments: string[]; now: string;
  onClose: () => void; onSaved: (message: string, date: string) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState(initial);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [over, setOver] = useState(false);
  const set = (patch: Partial<BookDraft>) => { setDraft(current => ({ ...current, ...patch })); setFailure(null); };

  useEffect(() => { const dialog = ref.current; if (dialog && !dialog.open) dialog.showModal(); }, []);

  // Starts that have not passed (on today), and the lengths that fit from the chosen start.
  const starts = useMemo(() => slotTimes().slice(0, -1).filter(time => new Date(wibInstant(draft.date, time)) > new Date(now)), [draft.date, now]);
  const ends = useMemo(() => durationsFrom(draft.start).map(length => ({ time: minutesClock(clockMinutes(draft.start) + length), length })), [draft.start]);
  const start = starts.includes(draft.start) ? draft.start : starts[0] ?? draft.start;
  const end = ends.some(option => option.time === draft.end) ? draft.end : ends[1]?.time ?? ends[0]?.time ?? draft.end;

  const others = people.filter(person => person.id !== meId);
  const picked = new Set(draft.participants);
  const count = headcount(picked.size);
  const largest = largestCapacity(rooms);
  const room = rooms.find(item => item.id === draft.roomId);
  const fit = room ? roomFit(room, count, largest) : null;
  const kept = room ? roomKeptFrom(room, departments) : null;
  const query = search.trim().toLowerCase();
  const shown = others.filter(person => !query || `${person.name} ${person.fullName ?? ""} ${person.department}`.toLowerCase().includes(query)).slice(0, 60);
  const toggle = (id: string) => set({ participants: picked.has(id) ? draft.participants.filter(item => item !== id) : [...draft.participants, id] });
  const fieldError = (name: string) => failure?.fields[name]?.[0];

  async function submit(extra: { confirmed?: boolean } = {}) {
    setBusy(true); setFailure(null);
    try {
      const { message } = await praWamRequest(bookingApi.bookings(editId), { method: editId ? "PATCH" : "POST", json: { ...draft, start, end, place: "", confirmed: extra.confirmed ?? confirmed, overCapacity: over } });
      onSaved(message, draft.date);
    } catch (error) {
      const known = error as { fieldErrors?: Record<string, string[]>; conflict?: Conflict };
      setFailure({ message: errorText(error), fields: known.fieldErrors ?? {}, conflict: known.conflict });
    } finally { setBusy(false); }
  }

  return <dialog ref={ref} className={css.dialog} aria-labelledby="book-title" onClose={onClose}>
    <form className={css.form} onSubmit={event => { event.preventDefault(); void submit(); }}>
      <div className={css.formHead}>
        <h2 id="book-title">{editId ? "Ubah booking" : "Booking ruangan"}</h2>
        <button type="button" className={css.iconBtn} aria-label="Tutup" onClick={() => ref.current?.close()}><X size={20} aria-hidden /></button>
      </div>
      <div className={css.formBody}>
        <div className={css.field}>
          <label className={css.label} htmlFor="book-room"><DoorOpen size={18} aria-hidden />Ruangan</label>
          <select id="book-room" className={css.control} required value={draft.roomId} onChange={event => set({ roomId: event.target.value })}>
            <option value="" disabled>Pilih ruangan</option>
            {rooms.map(item => <option key={item.id} value={item.id}>{item.name}{item.capacity ? ` · muat ${item.capacity} orang` : ""}</option>)}
          </select>
          {kept && <p className={css.error}>{kept}. Pilih ruangan lain.</p>}
          {!kept && fit && !fit.ok && <p className={css.error}>{fit.text}.</p>}
          {!kept && fit?.ok && fit.note && <p className={css.hint}>{fit.note}.</p>}
          {fieldError("roomId") && <p className={css.error}>{fieldError("roomId")}</p>}
        </div>

        <div className={css.field}>
          <label className={css.label} htmlFor="book-date"><CalendarDays size={18} aria-hidden />Tanggal</label>
          <select id="book-date" className={css.control} value={draft.date} onChange={event => set({ date: event.target.value })}>
            {dates.map(date => <option key={date} value={date}>{dayLabel(date)}</option>)}
          </select>
          {fieldError("date") && <p className={css.error}>{fieldError("date")}</p>}
        </div>

        <div className={css.cols}>
          <div className={css.field}>
            <label className={css.label} htmlFor="book-start"><Clock size={18} aria-hidden />Mulai</label>
            <select id="book-start" className={css.control} value={start} onChange={event => set({ start: event.target.value })}>
              {starts.length ? starts.map(time => <option key={time} value={time}>{clockLabel(time)}</option>) : <option value={draft.start}>Sudah lewat</option>}
            </select>
            {fieldError("start") && <p className={css.error}>{fieldError("start")}</p>}
          </div>
          <div className={css.field}>
            <label className={css.label} htmlFor="book-end"><Clock size={18} aria-hidden />Selesai</label>
            <select id="book-end" className={css.control} value={end} onChange={event => set({ end: event.target.value })}>
              {ends.map(option => <option key={option.time} value={option.time}>{clockLabel(option.time)} · {durationLabel(option.length)}</option>)}
            </select>
            {fieldError("end") && <p className={css.error}>{fieldError("end")}</p>}
          </div>
        </div>

        <div className={css.field}>
          <label className={css.label} htmlFor="book-what"><PenLine size={18} aria-hidden />Nama kegiatan</label>
          <input id="book-what" className={css.control} required minLength={2} maxLength={120} value={draft.title} onChange={event => set({ title: event.target.value })} placeholder="Contoh: Rapat mingguan tim" />
          {fieldError("title") && <p className={css.error}>{fieldError("title")}</p>}
        </div>

        <div className={css.field}>
          <span className={css.label} id="book-for">Untuk siapa</span>
          <div className={css.choices} role="group" aria-labelledby="book-for">
            <button type="button" className={css.choice} aria-pressed={draft.audience === "internal"} onClick={() => set({ audience: "internal" })}><Building2 size={22} aria-hidden />{audienceLabels.internal}</button>
            <button type="button" className={css.choice} aria-pressed={draft.audience === "eksternal"} onClick={() => set({ audience: "eksternal" })}><Handshake size={22} aria-hidden />{audienceLabels.eksternal}</button>
          </div>
          {draft.audience === "eksternal" && <>
            <label className={css.hint} htmlFor="book-guest">Tamu dari mana? (nama orang atau perusahaan)</label>
            <input id="book-guest" className={css.control} required minLength={2} maxLength={200} value={draft.externalNote} onChange={event => set({ externalNote: event.target.value })} />
            {fieldError("externalNote") && <p className={css.error}>{fieldError("externalNote")}</p>}
          </>}
        </div>

        <div className={css.field}>
          <label className={css.label} htmlFor="book-people"><Users size={18} aria-hidden />Siapa yang ikut · {count} orang termasuk kamu</label>
          {picked.size > 0 && <div className={css.picked}>{others.filter(person => picked.has(person.id)).map(person =>
            <button key={person.id} type="button" className={css.pickedOne} aria-label={`Hapus ${person.name}`} onClick={() => toggle(person.id)}>{person.name}<X size={14} aria-hidden /></button>)}</div>}
          <div style={{ position: "relative" }}>
            <Search size={18} aria-hidden style={{ position: "absolute", left: 12, top: 13, opacity: .6 }} />
            <input id="book-people" className={css.control} style={{ paddingLeft: "2.25rem" }} type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Cari nama atau departemen" />
          </div>
          <ul className={css.people}>{shown.map(person => <li key={person.id}>
            <label className={css.person}><input type="checkbox" checked={picked.has(person.id)} onChange={() => toggle(person.id)} /><span>{person.name} <small>· {person.department}</small></span></label>
          </li>)}{!shown.length && <li className={css.empty} style={{ padding: ".5rem" }}>Tidak ada nama yang cocok.</li>}</ul>
          {fit?.ok && fit.over && <label className={css.person}><input type="checkbox" checked={over} onChange={event => setOver(event.target.checked)} /><span>Ya, saya yakin: {fit.note?.toLowerCase()}.</span></label>}
        </div>

        <div className={css.field}>
          <label className={css.label} htmlFor="book-note">Catatan (boleh kosong)</label>
          <textarea id="book-note" className={css.control} maxLength={500} value={draft.description} onChange={event => set({ description: event.target.value })} />
        </div>

        {failure && <div className={css.noteBad} role="alert"><AlertTriangle size={18} aria-hidden /><div>
          <p>{failure.message}</p>
          {failure.conflict?.kind === "participants" && <div className={css.alts}>
            <button type="button" className={css.btnQuiet} disabled={busy} onClick={() => { setConfirmed(true); void submit({ confirmed: true }); }}>Tetap simpan</button>
          </div>}
          {failure.conflict?.kind === "room" && <div className={css.alts}>
            {failure.conflict.sameRoom?.map(option => <button key={option.start} type="button" className={css.btnQuiet} onClick={() => set({ start: option.start, end: option.end })}>{clockLabel(option.start)}–{clockLabel(option.end)}</button>)}
            {failure.conflict.otherRooms?.map(id => rooms.find(item => item.id === id)).filter(item => !!item).map(item => <button key={item.id} type="button" className={css.btnQuiet} onClick={() => set({ roomId: item.id })}>{item.name}</button>)}
          </div>}
        </div></div>}
      </div>
      <div className={css.formFoot}>
        <button type="button" className={css.btnQuiet} onClick={() => ref.current?.close()}>Batal</button>
        <button type="submit" className={css.btn} disabled={busy || !draft.roomId || !!kept || (!!fit && !fit.ok) || (!!fit?.ok && !!fit.over && !over) || !starts.length}>{busy ? "Menyimpan…" : editId ? "Simpan perubahan" : "Booking"}</button>
      </div>
    </form>
  </dialog>;
}
