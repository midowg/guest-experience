"use client";

import { useMemo, useState } from "react";
import { CalendarDays, ChevronDown, ExternalLink, Plus, Search, Trash2, UserRound } from "lucide-react";
import { Notice } from "@/components/ui";
import { ConsoleButton, ConsoleButtonLink, PageHeader, type Crumb } from "@/components/console";
import { adminRequest, errorMessage } from "@/components/admin/shared/api";
import { HINTS_MAX, isMenRoom, parseSentences, type MissionSheet, type SheetPerson } from "@/lib/pra-wam/mission-sheet";
import { praWamMissionApi, praWamMissionSessionsApi, praWamPath } from "@/lib/routes";
import type { MissionAdminState } from "@/lib/server/pra-wam/mission-admin";
import type { MissionSessionsState } from "@/lib/server/pra-wam/mission-sessions";
import css from "./mission-admin.module.css";

type Message = { tone: "success" | "error"; text: string } | null;
const savedLabel = (iso: string) => new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(new Date(iso));

/** A free key for a new room: "C…" for a men's room (the quiz keeps its names in that group), "R…" otherwise. */
function freeKey(rooms: Record<string, string>, men: boolean) {
  const prefix = men ? "C" : "R";
  for (let n = 1; ; n += 1) if (!(`${prefix}${n}` in rooms)) return `${prefix}${n}`;
}
const blankPerson = (room: string): SheetPerson => ({ name: "", nick: "", dept: "", room, sleep: null, wake: null, sents: [], hints: [] });

/**
 * Admin Pra WAM → Misi Perjalanan (24 Nov 2026): the rooms (the number people see, and whether it is a
 * men's room for the quiz), the HoD in each with their nickname, department, sleeping hours,
 * sentences of Susun Kalimatmu and up to three quiz hints, and the BoD (the CEO marked). Names must
 * match the account's name; names that match none are shown. Simpan keeps the old list as a backup.
 */
const sessionWhen = (iso: string | null) => iso ? new Intl.DateTimeFormat("id-ID", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(new Date(iso)) : "Belum ada jam";
const SESSIONS_MAX = 5;

export function PraWamMission({ initial, sessions: initialSessions, crumbs = [], title = "Misi Perjalanan" }: { initial: MissionAdminState; sessions: MissionSessionsState; crumbs?: readonly Crumb[]; title?: string }) {
  const [state, setState] = useState(initial);
  const [sheet, setSheet] = useState<MissionSheet>(initial.sheet);
  const [tab, setTab] = useState<"kamar" | "bod" | "sesi">("kamar");
  const [sessions, setSessions] = useState(initialSessions);
  const [sessionIds, setSessionIds] = useState(initialSessions.ids);
  const [sessionQuery, setSessionQuery] = useState("");
  const sessionsChanged = sessionIds.join() !== sessions.ids.join();
  const firstSession = sessions.ids[0] ?? null;
  const [openPerson, setOpenPerson] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  const changed = JSON.stringify(sheet) !== JSON.stringify(state.sheet);
  const locked = !state.migrated || busy;
  const roomKeys = Object.keys(sheet.rooms);
  const homeless = sheet.people.map((person, index) => ({ person, index })).filter(({ person }) => !(person.room in sheet.rooms));
  const match = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return (person: SheetPerson) => words.every(word => `${person.name} ${person.nick} ${person.dept}`.toLowerCase().includes(word));
  }, [query]);

  const update = (change: (current: MissionSheet) => MissionSheet) => { setSheet(current => change(current)); setMessage(null); };
  const setPerson = (index: number, patch: Partial<SheetPerson>) => update(current => ({ ...current, people: current.people.map((person, at) => at === index ? { ...person, ...patch } : person) }));
  const addRoom = () => update(current => {
    const key = freeKey(current.rooms, false);
    return { ...current, rooms: { ...current.rooms, [key]: "" } };
  });
  const setGroup = (key: string, men: boolean) => update(current => {
    if (isMenRoom(key) === men) return current;
    const next = freeKey(current.rooms, men);
    const rooms = Object.fromEntries(Object.entries(current.rooms).map(([room, code]) => [room === key ? next : room, code]));
    return { ...current, rooms, people: current.people.map(person => person.room === key ? { ...person, room: next } : person) };
  });
  const addPerson = (room: string) => { setOpenPerson(sheet.people.length); update(current => ({ ...current, people: [...current.people, blankPerson(room)] })); };

  async function saveSessions() {
    setBusy(true); setMessage(null);
    try {
      const result = await adminRequest<MissionSessionsState>(praWamMissionSessionsApi, { method: "PUT", body: JSON.stringify({ ids: sessionIds }) });
      if (result.data) { setSessions(result.data); setSessionIds(result.data.ids); }
      setMessage({ tone: "success", text: result.message });
    } catch (problem) { setMessage({ tone: "error", text: errorMessage(problem) }); }
    finally { setBusy(false); }
  }

  async function save() {
    setBusy(true); setMessage(null);
    try {
      const result = await adminRequest<MissionAdminState>(praWamMissionApi, { method: "PUT", body: JSON.stringify(sheet) });
      if (result.data) { setState(result.data); setSheet(result.data.sheet); }
      setMessage({ tone: "success", text: result.message });
    } catch (problem) { setMessage({ tone: "error", text: errorMessage(problem) }); }
    finally { setBusy(false); }
  }

  const personRow = (person: SheetPerson, index: number) => {
    const open = openPerson === index;
    const id = `hod-${index}`;
    return <li key={index} className={css.person}>
      <button type="button" className={css.personHead} aria-expanded={open} aria-controls={id} onClick={() => setOpenPerson(open ? null : index)}>
        <span className={css.ava} aria-hidden><UserRound /></span>
        <span className={css.personText}><strong>{person.name || "HoD baru"}</strong><small>{[person.nick, person.dept].filter(Boolean).join(" · ") || "Belum diisi"}</small></span>
        <span className={css.meta}>{person.hints.filter(Boolean).length}/{HINTS_MAX} petunjuk</span>
        <ChevronDown aria-hidden className={css.chev} data-open={open || undefined} />
      </button>
      {open && <div id={id} className={css.personBody}>
        <div className={css.fields}>
          <label className={css.field}><span>Nama lengkap (sama dengan akun)</span><input className="input" value={person.name} disabled={locked} onChange={event => setPerson(index, { name: event.target.value })} /></label>
          <label className={css.field}><span>Panggilan</span><input className="input" value={person.nick} disabled={locked} onChange={event => setPerson(index, { nick: event.target.value })} /></label>
          <label className={css.field}><span>Departemen</span><input className="input" value={person.dept} disabled={locked} onChange={event => setPerson(index, { dept: event.target.value })} /></label>
          <label className={css.field}><span>Kamar</span>
            <select className="select" value={person.room in sheet.rooms ? person.room : ""} disabled={locked} onChange={event => setPerson(index, { room: event.target.value })}>
              <option value="" disabled>Pilih kamar</option>
              {roomKeys.map(key => <option key={key} value={key}>{sheet.rooms[key] || "Kamar tanpa nomor"}</option>)}
            </select></label>
          <label className={css.field}><span>Jam tidur</span><input className="input" value={person.sleep ?? ""} placeholder="Contoh: 22.00–24.00" disabled={locked} onChange={event => setPerson(index, { sleep: event.target.value || null })} /></label>
          <label className={css.field}><span>Jam bangun</span><input className="input" value={person.wake ?? ""} placeholder="Contoh: 05.00–06.30" disabled={locked} onChange={event => setPerson(index, { wake: event.target.value || null })} /></label>
          <label className={css.field}><span>Kalimat Susun Kalimatmu (1–12)</span>
            <input key={`${index}-${person.sents.join()}`} className="input" defaultValue={person.sents.join(", ")} placeholder="Contoh: 6, 12" inputMode="numeric" disabled={locked} onBlur={event => setPerson(index, { sents: parseSentences(event.target.value) })} /></label>
        </div>
        <div className={css.hints}>
          {Array.from({ length: HINTS_MAX }, (_, at) => <label key={at} className={css.field}><span>Petunjuk {at + 1} untuk kuis</span>
            <textarea className="textarea" rows={2} value={person.hints[at] ?? ""} disabled={locked} placeholder="Dari jawaban kuesionernya, tanpa menyebut nama."
              onChange={event => { const hints = [...person.hints]; hints[at] = event.target.value; while (hints.length && !hints[hints.length - 1]) hints.pop(); setPerson(index, { hints }); }} /></label>)}
        </div>
        <div className={css.rowEnd}>
          <ConsoleButton className={css.danger} icon={<Trash2 size={16} aria-hidden />} disabled={locked} onClick={() => { update(current => ({ ...current, people: current.people.filter((_, at) => at !== index) })); setOpenPerson(null); }}>Hapus HoD</ConsoleButton>
        </div>
      </div>}
    </li>;
  };

  return <div className="stack">
    <PageHeader crumbs={crumbs} title={title}
      subtitle={`Kamar, penghuni, dan petunjuk kuis untuk Meeting HoD BoD. ${state.updatedAt ? `Tersimpan ${savedLabel(state.updatedAt)} WIB · ` : ""}Setiap Simpan menyimpan cadangan isi sebelumnya.`}
      actions={<>
        {firstSession && <ConsoleButtonLink href={praWamPath.session(firstSession)} target="_blank" rel="noopener" icon={<ExternalLink size={18} aria-hidden />}>Buka Misi Perjalanan<span className="sr-only"> (tab baru)</span></ConsoleButtonLink>}
        <ConsoleButton variant="primary" disabled={locked || !changed} onClick={() => { void save(); }}>{busy ? "Menyimpan…" : "Simpan"}</ConsoleButton>
      </>} />
    {!state.migrated && <Notice tone="warning">Misi Perjalanan menunggu tabel pw_settings (migrasi 202611120001).</Notice>}
    {state.unmatched.length > 0 && <Notice tone="warning">Nama ini tidak cocok dengan akun mana pun, jadi orangnya tidak melihat kamarnya: {state.unmatched.join(", ")}. Samakan dengan nama di Akun dan peran.</Notice>}
    <div aria-live="polite">{message && <Notice tone={message.tone} role={message.tone === "error" ? "alert" : "status"}>{message.text}</Notice>}</div>
    {changed && !message && <p className={css.unsaved}>Ada perubahan yang belum disimpan.</p>}

    <div className={css.tabs} role="tablist" aria-label="Bagian">
      <button type="button" role="tab" aria-selected={tab === "kamar"} onClick={() => setTab("kamar")}>Kamar dan HoD <span>{sheet.people.length}</span></button>
      <button type="button" role="tab" aria-selected={tab === "bod"} onClick={() => setTab("bod")}>BoD <span>{sheet.bod.length}</span></button>
      <button type="button" role="tab" aria-selected={tab === "sesi"} onClick={() => setTab("sesi")}>Sesi <span>{sessions.ids.length}</span></button>
    </div>

    {tab === "kamar" && <div className="stack">
      <div className={css.toolbar}>
        <label className={css.search}><span className="sr-only">Cari HoD</span><Search aria-hidden />
          <input className="input" type="search" value={query} placeholder="Cari nama, panggilan, atau departemen" onChange={event => setQuery(event.target.value)} /></label>
        <ConsoleButton icon={<Plus size={18} aria-hidden />} disabled={locked} onClick={addRoom}>Tambah kamar</ConsoleButton>
      </div>

      {homeless.length > 0 && <section className={`${css.room} ${css.roomWarn}`} aria-label="Belum ada kamar">
        <header className={css.roomHead}><strong>Belum ada kamar</strong><small>Pilih kamarnya di setiap HoD.</small></header>
        <ul className={css.people}>{homeless.filter(({ person }) => match(person)).map(({ person, index }) => personRow(person, index))}</ul>
      </section>}

      {roomKeys.length === 0 && <p className={css.empty}>Belum ada kamar. Tambah kamar, lalu isi penghuninya.</p>}
      <div className={css.rooms}>{roomKeys.map(key => {
        const inRoom = sheet.people.map((person, index) => ({ person, index })).filter(({ person }) => person.room === key);
        const shown = inRoom.filter(({ person }) => match(person));
        if (query.trim() && !shown.length) return null;
        return <section key={key} className={css.room} aria-label={`Kamar ${sheet.rooms[key] || "tanpa nomor"}`}>
          <header className={css.roomHead}>
            <label className={css.code}><span>Nomor kamar</span><input className="input" value={sheet.rooms[key]} placeholder="A3" disabled={locked} onChange={event => update(current => ({ ...current, rooms: { ...current.rooms, [key]: event.target.value } }))} /></label>
            <label className={css.code}><span>Kelompok kuis</span>
              <select className="select" value={isMenRoom(key) ? "putra" : "putri"} disabled={locked} onChange={event => setGroup(key, event.target.value === "putra")}>
                <option value="putri">Putri</option><option value="putra">Putra</option>
              </select></label>
            <span className={css.count}>{inRoom.length} orang</span>
            <ConsoleButton className={css.danger} icon={<Trash2 size={16} aria-hidden />} disabled={locked || inRoom.length > 0} title={inRoom.length ? "Pindahkan atau hapus penghuninya dulu" : undefined}
              onClick={() => update(current => ({ ...current, rooms: Object.fromEntries(Object.entries(current.rooms).filter(([room]) => room !== key)) }))}>Hapus kamar</ConsoleButton>
          </header>
          {shown.length > 0 && <ul className={css.people}>{shown.map(({ person, index }) => personRow(person, index))}</ul>}
          <button type="button" className={css.addPerson} disabled={locked} onClick={() => addPerson(key)}><Plus aria-hidden />Tambah HoD ke kamar ini</button>
        </section>;
      })}</div>
    </div>}

    {tab === "sesi" && <section className={css.room} aria-label="Sesi yang membuka Misi Perjalanan">
      <p className={css.hint}>Pilih sesi yang membuka Misi Perjalanan. Untuk HoD, BoD, dan akun uji, kartu sesi itu di Beranda dan Agenda langsung membuka Misi Perjalanan; peserta lain tetap melihat detail sesi biasa.{!sessions.saved && " Belum diatur: sementara memakai sesi forum Meeting HoD BoD."}</p>
      {sessionIds.length > 0 && <ul className={css.people}>{sessionIds.map(id => {
        const session = sessions.choices.find(item => item.id === id);
        return <li key={id} className={css.person}><div className={css.personHead}>
          <span className={css.ava} aria-hidden><CalendarDays /></span>
          <span className={css.personText}><strong>{session?.title ?? "Sesi tidak ditemukan"}</strong><small>{session ? `${sessionWhen(session.startsAt)}${session.status === "draf" ? " · draf" : ""}` : "Mungkin sudah dihapus"}</small></span>
          <ConsoleButton className={css.danger} disabled={locked} onClick={() => { setSessionIds(sessionIds.filter(item => item !== id)); setMessage(null); }}>Lepas</ConsoleButton>
        </div></li>;
      })}</ul>}
      <label className={css.search}><span className="sr-only">Cari sesi</span><Search aria-hidden />
        <input className="input" type="search" value={sessionQuery} placeholder={sessionIds.length >= SESSIONS_MAX ? `Paling banyak ${SESSIONS_MAX} sesi` : "Cari judul sesi"} disabled={locked || sessionIds.length >= SESSIONS_MAX} onChange={event => setSessionQuery(event.target.value)} /></label>
      {sessionQuery.trim() && <ul className={css.people}>{sessions.choices.filter(item => !sessionIds.includes(item.id) && sessionQuery.trim().toLowerCase().split(/\s+/).every(word => item.title.toLowerCase().includes(word))).slice(0, 8).map(item => <li key={item.id} className={css.person}>
        <button type="button" className={css.personHead} disabled={locked} onClick={() => { setSessionIds([...sessionIds, item.id]); setSessionQuery(""); setMessage(null); }}>
          <span className={css.ava} aria-hidden><CalendarDays /></span>
          <span className={css.personText}><strong>{item.title}</strong><small>{sessionWhen(item.startsAt)}{item.status === "draf" ? " · draf" : ""}</small></span>
          <span className={css.meta}>Pilih</span>
        </button></li>)}</ul>}
      <div className={css.rowEnd}><ConsoleButton variant="primary" disabled={locked || !sessionsChanged} onClick={() => { void saveSessions(); }}>{busy ? "Menyimpan…" : "Simpan sesi"}</ConsoleButton></div>
    </section>}

    {tab === "bod" && <section className={css.room} aria-label="BoD">
      <p className={css.hint}>BoD tidak punya kamar di daftar ini. CEO mendapat Mode CEO untuk menampilkan pertanyaan di layar meeting.</p>
      <ul className={css.bodList}>{sheet.bod.map((person, index) => <li key={index}>
        <label className={css.field}><span>Nama lengkap (sama dengan akun)</span><input className="input" value={person.name} disabled={locked}
          onChange={event => update(current => ({ ...current, bod: current.bod.map((item, at) => at === index ? { ...item, name: event.target.value } : item) }))} /></label>
        <label className={css.field}><span>Kalimat (1–12)</span><input key={`${index}-${person.sents.join()}`} className="input" defaultValue={person.sents.join(", ")} placeholder="Contoh: 1" disabled={locked}
          onBlur={event => update(current => ({ ...current, bod: current.bod.map((item, at) => at === index ? { ...item, sents: parseSentences(event.target.value) } : item) }))} /></label>
        <label className={css.ceo}><input type="checkbox" checked={!!person.ceo} disabled={locked}
          onChange={event => update(current => ({ ...current, bod: current.bod.map((item, at) => at === index ? { ...item, ceo: event.target.checked || undefined } : item) }))} />CEO</label>
        <ConsoleButton className={css.danger} icon={<Trash2 size={16} aria-hidden />} disabled={locked} aria-label={`Hapus ${person.name || "BoD"}`}
          onClick={() => update(current => ({ ...current, bod: current.bod.filter((_, at) => at !== index) }))}>Hapus</ConsoleButton>
      </li>)}</ul>
      <button type="button" className={css.addPerson} disabled={locked} onClick={() => update(current => ({ ...current, bod: [...current.bod, { name: "", sents: [] }] }))}><Plus aria-hidden />Tambah BoD</button>
    </section>}
  </div>;
}
