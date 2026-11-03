"use client";

import { useEffect, useState } from "react";
import { Button, ButtonLink, Notice } from "@/components/ui";
import { clockLabel, overlaps, wibTime, type Person, type Room } from "@/lib/pra-wam/appraisal";
import { sessionKindLabels, sessionKinds, sessionProblems, sessionSpan, sessionStatusLabels, sessionTimes, sessionWhen, type RoomUse, type Session, type SessionInput } from "@/lib/pra-wam/sessions";
import { praWamApi, praWamPath } from "@/lib/routes";
import { errorText, praWamRequest, PraWamApiError } from "./api";
import type { PeopleGroup } from "./BookingForm";
import styles from "./pra-wam.module.css";

type Props = { session: Session | null; initial: SessionInput; rooms: Room[]; people: Person[]; groups: PeopleGroup[] };

/**
 * Panitia makes or changes a session: what, when, which room (free rooms at those hours are
 * shown, a booking or another session in the way is named), and who takes part, by unit or all.
 */
export function SessionForm({ session, initial, rooms, people, groups }: Props) {
  const [draft, setDraft] = useState(initial);
  const [uses, setUses] = useState<RoomUse[]>([]);
  const [groupId, setGroupId] = useState(groups[0]?.id ?? "");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const set = (patch: Partial<SessionInput>) => setDraft(current => ({ ...current, ...patch }));

  useEffect(() => {
    if (!draft.date) return;
    let stale = false;
    praWamRequest<RoomUse[]>(praWamApi.roomUses(draft.date)).then(result => { if (!stale) setUses(result.data ?? []); }).catch(() => undefined);
    return () => { stale = true; };
  }, [draft.date]);

  const span = sessionSpan(draft);
  const usedBy = (room: Room) => span ? uses.find(use => use.roomId === room.id && use.sourceId !== session?.id && overlaps(use, span)) : undefined;
  const picked = new Set(draft.participants);
  const query = search.trim().toLowerCase();
  const group = groups.find(item => item.id === groupId);
  const offered = people.filter(person => !picked.has(person.id) && (query ? person.name.toLowerCase().includes(query) : !!group?.memberIds.includes(person.id)));
  const status = session?.status ?? "draf";

  async function save(publish: boolean) {
    setError(null); setFieldErrors({});
    const local = sessionProblems(draft, publish || status === "terbit");
    if (draft.title.trim().length < 2) local.title = "Isi nama sesi.";
    if (Object.keys(local).length) { setFieldErrors(local); setError("Periksa kembali isian sesi."); return; }
    setBusy(publish ? "publish" : "save");
    try {
      const result = await praWamRequest<Session>(session ? praWamApi.sessions(session.id) : praWamApi.sessions(), { method: session ? "PATCH" : "POST", json: { ...draft, ...(publish ? { publish: true } : {}) } });
      window.location.assign(session ? praWamPath.sessions : praWamPath.editSession(result.data.id));
    } catch (problem) {
      if (problem instanceof PraWamApiError && problem.fieldErrors) setFieldErrors(Object.fromEntries(Object.entries(problem.fieldErrors).map(([key, list]) => [key, list[0]])));
      setError(errorText(problem)); setBusy(null);
    }
  }
  async function changeStatus(next: "draf" | "batal") {
    if (!session) return;
    const question = next === "batal" ? `Batalkan "${session.title}"? Sesi hilang dari agenda peserta dan ruangnya kembali tersedia.` : `Kembalikan "${session.title}" ke draf? Sesi hilang dari agenda peserta sampai diterbitkan lagi.`;
    if (!window.confirm(question)) return;
    setBusy(next); setError(null);
    try { await praWamRequest(praWamApi.sessionStatus(session.id), { method: "POST", json: { status: next } }); window.location.assign(praWamPath.sessions); }
    catch (problem) { setError(errorText(problem)); setBusy(null); }
  }

  const fieldError = (key: string) => fieldErrors[key] && <p className={styles.error}>{fieldErrors[key]}</p>;
  return <form className={styles.form} onSubmit={event => { event.preventDefault(); void save(false); }} noValidate>
    <div className={styles.head}>
      <div>
        <p className={styles.kicker}>{session ? `${sessionStatusLabels[status]} · ${sessionWhen(session)}` : "Sesi baru"}</p>
        <h1>{session ? "Ubah sesi" : "Buat sesi"}</h1>
      </div>
      <ButtonLink variant="secondary" href={praWamPath.sessions}>Semua sesi</ButtonLink>
    </div>
    {error && <Notice tone="error">{error}</Notice>}
    {status === "batal" && <Notice tone="info">Sesi ini dibatalkan. Menyimpan mengembalikannya menjadi draf.</Notice>}

    <section className={`${styles.card} ${styles.section}`} aria-labelledby="sesi">
      <h2 id="sesi">Sesi</h2>
      <div>
        <label className={styles.label} htmlFor="title">Nama sesi</label>
        <input id="title" className="input" value={draft.title} maxLength={150} aria-invalid={!!fieldErrors.title} onChange={event => set({ title: event.target.value })} />
        {fieldError("title")}
      </div>
      <div className={styles.dates} role="group" aria-label="Jenis sesi">
        {sessionKinds.map(kind => <button key={kind} type="button" className={`${styles.chip} ${styles.chipSmall}`} aria-pressed={draft.kind === kind} onClick={() => set({ kind })}>{sessionKindLabels[kind]}</button>)}
      </div>
      <div>
        <label className={styles.label} htmlFor="description">Deskripsi <span className={styles.meta}>(opsional)</span></label>
        <textarea id="description" className="textarea" rows={4} maxLength={2000} value={draft.description} onChange={event => set({ description: event.target.value })} />
      </div>
    </section>

    <section className={`${styles.card} ${styles.section}`} aria-labelledby="waktu">
      <h2 id="waktu">Tanggal dan jam</h2>
      {session?.planFrom && !session.startsAt && <p className={styles.hint}>Rentang di kalender: {sessionWhen({ ...session, startsAt: null, endsAt: null })}.</p>}
      <div className={styles.times}>
        <div><label className={styles.label} htmlFor="date">Tanggal</label>
          <input id="date" className="input" type="date" value={draft.date} min={session?.planFrom ?? undefined} aria-invalid={!!fieldErrors.date} onChange={event => set({ date: event.target.value })} />{fieldError("date")}</div>
        <div />
        <div><label className={styles.label} htmlFor="start">Mulai</label>
          <select id="start" className="select" value={draft.start} aria-invalid={!!fieldErrors.start} onChange={event => set({ start: event.target.value })}>
            <option value="">—</option>{sessionTimes().map(time => <option key={time} value={time}>{clockLabel(time)}</option>)}
          </select>{fieldError("start")}</div>
        <div><label className={styles.label} htmlFor="end">Selesai</label>
          <select id="end" className="select" value={draft.end} aria-invalid={!!fieldErrors.end} onChange={event => set({ end: event.target.value })}>
            <option value="">—</option>{sessionTimes().filter(time => !draft.start || time > draft.start).map(time => <option key={time} value={time}>{clockLabel(time)}</option>)}
          </select>{fieldError("end")}</div>
      </div>
      <p className={styles.hint}>Draf boleh tanpa jam. Untuk menerbitkan, isi tanggal dan jam.</p>
    </section>

    <section className={`${styles.card} ${styles.section}`} aria-labelledby="ruang">
      <h2 id="ruang">Ruang</h2>
      {!span && <p className={styles.hint}>Isi tanggal dan jam dulu supaya terlihat ruang yang kosong.</p>}
      <div className={styles.rooms}>
        {rooms.map(room => {
          const use = usedBy(room);
          return <button key={room.id} type="button" className={styles.roomOption} aria-pressed={draft.roomId === room.id} disabled={!span || !!use} onClick={() => set({ roomId: draft.roomId === room.id ? "" : room.id })}>
            <strong>{room.name}</strong>
            {!span ? <span className={styles.meta}>{room.kind === "utama" ? "Ruang utama" : "Area"}</span>
              : use ? <span className={`${styles.status} ${styles.busy}`}>Dipakai {use.label}, {clockLabel(wibTime(use.startsAt))}–{clockLabel(wibTime(use.endsAt))}</span>
              : <span className={`${styles.status} ${styles.free}`}>Kosong</span>}
            <span className={styles.meta}>{room.capacity ? `Kapasitas ${room.capacity} orang` : "Kapasitas belum diisi"}</span>
          </button>;
        })}
      </div>
      {fieldError("roomId")}
      {!draft.roomId && <div>
        <label className={styles.label} htmlFor="location">Tempat lain <span className={styles.meta}>(bila tidak di ruang kantor)</span></label>
        <input id="location" className="input" value={draft.location} maxLength={200} placeholder="Mis. nama restoran" onChange={event => set({ location: event.target.value })} />
      </div>}
    </section>

    <section className={`${styles.card} ${styles.section}`} aria-labelledby="peserta">
      <h2 id="peserta">Peserta <span className={styles.meta}>({draft.participants.length} orang)</span></h2>
      <div className={styles.actions}>
        <button type="button" className="button button--secondary" onClick={() => set({ participants: people.map(person => person.id) })}>Semua karyawan ({people.length})</button>
        {draft.participants.length > 0 && <button type="button" className="button button--quiet" onClick={() => set({ participants: [] })}>Kosongkan</button>}
      </div>
      {draft.participants.length > 0 && <div className={styles.picked} aria-label="Peserta terpilih">
        {draft.participants.map(id => people.find(person => person.id === id)).filter((person): person is Person => !!person).map(person => <span key={person.id} className={`${styles.chip} ${styles.chipSmall} ${styles.pickedChip}`}>
          {person.name}<button type="button" className={styles.chipRemove} aria-label={`Hapus ${person.name}`} onClick={() => set({ participants: draft.participants.filter(item => item !== person.id) })}>×</button>
        </span>)}
      </div>}
      <input className="input" type="search" aria-label="Cari nama" placeholder="Cari nama, atau pilih unit di bawah" value={search} onChange={event => setSearch(event.target.value)} />
      {!query && <div className={styles.dates} role="group" aria-label="Departemen dan BU">
        {groups.map(item => <button key={item.id} type="button" className={`${styles.chip} ${styles.chipSmall}`} aria-pressed={item.id === groupId} onClick={() => setGroupId(item.id)}>{item.label}</button>)}
      </div>}
      {!query && group && offered.length > 1 && <button type="button" className="button button--quiet" onClick={() => set({ participants: [...draft.participants, ...offered.map(person => person.id)] })}>Tambah semua {group.label} ({offered.length})</button>}
      <div className={styles.people}>
        {offered.slice(0, 60).map(person => <button key={person.id} type="button" className={`${styles.chip} ${styles.chipSmall}`} onClick={() => { set({ participants: [...draft.participants, person.id] }); setSearch(""); }}>+ {person.name}</button>)}
      </div>
    </section>

    <div className={styles.sticky}>
      {status === "terbit"
        ? <Button type="submit" disabled={!!busy}>{busy === "save" ? "Menyimpan…" : "Simpan perubahan"}</Button>
        : <>
          <Button type="button" disabled={!!busy} onClick={() => save(true)}>{busy === "publish" ? "Menerbitkan…" : "Terbitkan"}</Button>
          <Button type="submit" variant="secondary" disabled={!!busy}>{busy === "save" ? "Menyimpan…" : "Simpan draf"}</Button>
        </>}
      {session && status === "terbit" && <button type="button" className="button button--quiet" disabled={!!busy} onClick={() => changeStatus("draf")}>Kembalikan ke draf</button>}
      {session && status !== "batal" && <button type="button" className="button button--quiet" disabled={!!busy} onClick={() => changeStatus("batal")}>Batalkan sesi</button>}
    </div>
  </form>;
}
