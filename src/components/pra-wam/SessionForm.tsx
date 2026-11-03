"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Circle, Send } from "lucide-react";
import { Button, ButtonLink, Notice } from "@/components/ui";
import { clockLabel, overlaps, wibTime, type Person, type Room } from "@/lib/pra-wam/appraisal";
import { sessionKindLabels, sessionKinds, sessionProblems, sessionSpan, sessionStatusLabels, sessionTimes, sessionWhen, type RoomUse, type Session, type SessionInput } from "@/lib/pra-wam/sessions";
import { praWamApi, praWamPath } from "@/lib/routes";
import { errorText, praWamRequest, PraWamApiError } from "./api";
import type { PeopleGroup } from "./BookingForm";
import { useConfirm } from "./ConfirmDialog";
import { ScreenHead } from "./ScreenHead";
import panel from "./panitia.module.css";
import styles from "./pra-wam.module.css";

type Props = { session: Session | null; initial: SessionInput; rooms: Room[]; people: Person[]; groups: PeopleGroup[] };
type Check = { tone: "ok" | "no" | "wait"; text: string };

/** The Pra WAM period (event pra-wam-2026), for the automatic check. */
const PRA_WAM_FROM = "2026-10-28", PRA_WAM_TO = "2026-12-23";

/**
 * Panitia makes or changes a session (Penpot "D7 · Buat sesi"): the form on the left, and on the
 * right the checks the server will also make (room free, capacity, period), shown while typing.
 */
export function SessionForm({ session, initial, rooms, people, groups }: Props) {
  const router = useRouter();
  const [draft, setDraft] = useState(initial);
  const [uses, setUses] = useState<RoomUse[]>([]);
  const [groupId, setGroupId] = useState(groups[0]?.id ?? "");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const set = (patch: Partial<SessionInput>) => setDraft(current => ({ ...current, ...patch }));
  const [confirm, confirmDialog] = useConfirm();
  /** The first field with a problem gets the focus (field ids match the error keys). */
  const showErrors = (found: Record<string, string>) => {
    setFieldErrors(found);
    const first = ["title", "date", "start", "end"].find(key => found[key]);
    if (first) requestAnimationFrame(() => document.getElementById(first)?.focus());
  };

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
    if (Object.keys(local).length) { showErrors(local); setError("Periksa kembali isian sesi."); return; }
    setBusy(publish ? "publish" : "save");
    try {
      const result = await praWamRequest<Session>(session ? praWamApi.sessions(session.id) : praWamApi.sessions(), { method: session ? "PATCH" : "POST", json: { ...draft, ...(publish ? { publish: true } : {}) } });
      router.refresh(); router.push(session ? praWamPath.sessions : praWamPath.editSession(result.data.id));
    } catch (problem) {
      if (problem instanceof PraWamApiError && problem.fieldErrors) showErrors(Object.fromEntries(Object.entries(problem.fieldErrors).map(([key, list]) => [key, list[0]])));
      setError(errorText(problem)); setBusy(null);
    }
  }
  async function changeStatus(next: "draf" | "batal") {
    if (!session) return;
    const ok = await confirm(next === "batal"
      ? { title: "Batalkan sesi?", body: `"${session.title}" hilang dari agenda peserta dan ruangnya kembali tersedia.`, confirmLabel: "Batalkan sesi", danger: true }
      : { title: "Kembalikan ke draf?", body: `"${session.title}" hilang dari agenda peserta sampai diterbitkan lagi.`, confirmLabel: "Kembalikan ke draf" });
    if (!ok) return;
    setBusy(next); setError(null);
    try { await praWamRequest(praWamApi.sessionStatus(session.id), { method: "POST", json: { status: next } }); router.refresh(); router.push(praWamPath.sessions); }
    catch (problem) { setError(errorText(problem)); setBusy(null); }
  }

  async function removeSession() {
    if (!session) return;
    if (!(await confirm({
      title: "Hapus sesi permanen?",
      body: `"${session.title}" beserta peserta, kehadiran, permintaan jadwal, dokumen, dan notifikasinya ikut terhapus dan tidak bisa dikembalikan.`,
      confirmLabel: "Hapus permanen",
      danger: true,
    }))) return;
    setBusy("hapus"); setError(null);
    try { await praWamRequest(praWamApi.sessions(session.id), { method: "DELETE" }); router.refresh(); router.push(praWamPath.sessions); }
    catch (problem) { setError(errorText(problem)); setBusy(null); }
  }

  // Pemeriksaan otomatis: what the server also checks, shown early.
  const room = rooms.find(item => item.id === draft.roomId);
  const roomUse = room ? usedBy(room) : undefined;
  const count = draft.participants.length;
  const checks = ([
    span ? { tone: "ok", text: "Tanggal dan jam lengkap" } : { tone: "wait", text: status === "terbit" ? "Isi tanggal dan jam" : "Jam belum diisi (draf boleh tanpa jam)" },
    room ? (roomUse ? { tone: "no", text: `${room.name} dipakai ${roomUse.label}` } : { tone: "ok", text: span ? `${room.name} kosong` : `${room.name} dipilih` })
      : draft.location ? { tone: "ok", text: `Tempat: ${draft.location}` } : { tone: "wait", text: "Ruang belum dipilih" },
    room ? (room.capacity == null ? { tone: "wait", text: "Kapasitas ruang belum diisi" }
      : room.capacity >= count ? { tone: "ok", text: `Kapasitas cukup (${room.capacity} untuk ${count} orang)` } : { tone: "no", text: `Kapasitas ${room.capacity}, peserta ${count}` }) : null,
    count ? { tone: "ok", text: `${count} peserta dipilih` } : { tone: "no", text: "Belum ada peserta" },
    draft.date ? (draft.date >= PRA_WAM_FROM && draft.date <= PRA_WAM_TO ? { tone: "ok", text: "Masih dalam periode Pra WAM" } : { tone: "no", text: "Di luar periode Pra WAM (28 Okt–23 Des)" }) : null,
  ] as (Check | null)[]).filter((check): check is Check => !!check);
  const checkIcon = (tone: Check["tone"]) => tone === "ok" ? <CheckCircle2 aria-hidden /> : tone === "no" ? <AlertTriangle aria-hidden /> : <Circle aria-hidden />;

  const fieldError = (key: string) => fieldErrors[key] && <p className={styles.error}>{fieldErrors[key]}</p>;
  return <form className={styles.form} onSubmit={event => { event.preventDefault(); void save(false); }} noValidate>
    <ScreenHead eyebrow={session ? `Jadwal sesi · ${sessionStatusLabels[status]}` : "Jadwal sesi · Sesi baru"} title={session ? "Ubah sesi" : "Buat sesi"}
      lead={session ? sessionWhen(session) : "Sesi baru tersimpan sebagai draf sampai diterbitkan. Agenda peserta berubah setelah terbit."}
      actions={<ButtonLink variant="secondary" href={praWamPath.sessions}>Semua sesi</ButtonLink>} />
    {error && <Notice tone="error">{error}</Notice>}
    {status === "batal" && <Notice tone="info">Sesi ini dibatalkan. Menyimpan mengembalikannya menjadi draf.</Notice>}

    <div className={panel.formGrid}>
      <section className={`${styles.card} ${panel.fields}`} aria-label="Isian sesi">
        <div>
          <label className={styles.label} htmlFor="title">Nama sesi</label>
          <input id="title" className="input" value={draft.title} maxLength={150} aria-invalid={!!fieldErrors.title} onChange={event => set({ title: event.target.value })} />
          {fieldError("title")}
        </div>
        <div className={panel.fieldRow}>
          <div><label className={styles.label} htmlFor="kind">Jenis</label>
            <select id="kind" className="select" value={draft.kind} onChange={event => set({ kind: event.target.value as SessionInput["kind"] })}>
              {sessionKinds.map(kind => <option key={kind} value={kind}>{sessionKindLabels[kind]}</option>)}
            </select></div>
          <div><label className={styles.label} htmlFor="date">Tanggal</label>
            <input id="date" className="input" type="date" value={draft.date} min={session?.planFrom ?? undefined} aria-invalid={!!fieldErrors.date} onChange={event => set({ date: event.target.value })} />
            {session?.planFrom && !session.startsAt && <p className={styles.hint}>Kalender: {sessionWhen({ ...session, startsAt: null, endsAt: null })}</p>}
            {fieldError("date")}</div>
        </div>
        <div className={panel.fieldRow}>
          <div><label className={styles.label} htmlFor="start">Mulai</label>
            <select id="start" className="select" value={draft.start} aria-invalid={!!fieldErrors.start} onChange={event => set({ start: event.target.value })}>
              <option value="">—</option>{sessionTimes().map(time => <option key={time} value={time}>{clockLabel(time)}</option>)}
            </select>{fieldError("start")}</div>
          <div><label className={styles.label} htmlFor="end">Selesai</label>
            <select id="end" className="select" value={draft.end} aria-invalid={!!fieldErrors.end} onChange={event => set({ end: event.target.value })}>
              <option value="">—</option>{sessionTimes().filter(time => !draft.start || time > draft.start).map(time => <option key={time} value={time}>{clockLabel(time)}</option>)}
            </select>{fieldError("end")}</div>
        </div>

        <div>
          <span className={styles.label}>Ruang</span>
          {room ? <div className={panel.roomPick}>
            <span><strong>{room.name}</strong><small>{room.capacity ? `${room.capacity} orang · ` : ""}{span ? (roomUse ? `dipakai ${roomUse.label}` : `kosong pada ${clockLabel(draft.start)}–${clockLabel(draft.end)}`) : "isi jam untuk cek ketersediaan"}</small></span>
            <button type="button" className="button button--secondary" onClick={() => set({ roomId: "" })}>Ganti ruang</button>
          </div> : <>
            {!span && <p className={styles.hint} style={{ margin: "0 0 8px" }}>Isi tanggal dan jam dulu supaya terlihat ruang yang kosong.</p>}
            <div className={styles.rooms}>
              {rooms.map(item => {
                const use = usedBy(item);
                return <button key={item.id} type="button" className={styles.roomOption} disabled={!span || !!use} onClick={() => set({ roomId: item.id })}>
                  <strong>{item.name}</strong>
                  {!span ? <span className={styles.meta}>{item.kind === "utama" ? "Ruang utama" : "Area"}</span>
                    : use ? <span className={`${styles.status} ${styles.busy}`}>Dipakai {use.label}, {clockLabel(wibTime(use.startsAt))}–{clockLabel(wibTime(use.endsAt))}</span>
                    : <span className={`${styles.status} ${styles.free}`}>Kosong</span>}
                  <span className={styles.meta}>{item.capacity ? `Kapasitas ${item.capacity} orang` : "Kapasitas belum diisi"}</span>
                </button>;
              })}
            </div>
            <div style={{ marginTop: 12 }}>
              <label className={styles.label} htmlFor="location">Tempat lain <span className={styles.meta}>(bila tidak di ruang kantor)</span></label>
              <input id="location" className="input" value={draft.location} maxLength={200} placeholder="Mis. nama restoran" onChange={event => set({ location: event.target.value })} />
            </div>
          </>}
          {fieldError("roomId")}
        </div>

        <div className={styles.section}>
          <div className={panel.cardHead} style={{ marginBottom: 0 }}><span className={styles.label} style={{ margin: 0 }}>Peserta sesi</span><strong className={styles.meta}>{count} orang dipilih</strong></div>
          <div className={styles.actions}>
            <button type="button" className="button button--secondary" onClick={() => set({ participants: people.map(person => person.id) })}>Semua karyawan ({people.length})</button>
            {count > 0 && <button type="button" className="button button--quiet" onClick={() => set({ participants: [] })}>Kosongkan</button>}
          </div>
          {count > 0 && <div className={styles.picked} aria-label="Peserta terpilih">
            {draft.participants.map(id => people.find(person => person.id === id)).filter((person): person is Person => !!person).map(person => <span key={person.id} className={`${styles.chip} ${styles.chipSmall} ${styles.pickedChip}`}>
              {person.name}<button type="button" className={styles.chipRemove} aria-label={`Hapus ${person.name}`} onClick={() => set({ participants: draft.participants.filter(item => item !== person.id) })}>×</button>
            </span>)}
          </div>}
          <input className="input" type="search" aria-label="Cari nama" placeholder="Cari nama, atau pilih unit di bawah" value={search} onChange={event => setSearch(event.target.value)} />
          {!query && <div className={styles.dates} role="group" aria-label="Departemen dan BU">
            {groups.map(item => <button key={item.id} type="button" className={`${styles.chip} ${styles.chipSmall}`} aria-pressed={item.id === groupId} onClick={() => setGroupId(item.id)}>{item.label}</button>)}
          </div>}
          {!query && group && offered.length > 1 && <button type="button" className="button button--quiet" style={{ justifySelf: "start" }} onClick={() => set({ participants: [...draft.participants, ...offered.map(person => person.id)] })}>Tambah semua {group.label} ({offered.length})</button>}
          <div className={styles.people}>
            {offered.slice(0, 60).map(person => <button key={person.id} type="button" className={`${styles.chip} ${styles.chipSmall}`} onClick={() => { set({ participants: [...draft.participants, person.id] }); setSearch(""); }}>+ {person.name}</button>)}
          </div>
        </div>

        <div>
          <label className={styles.label} htmlFor="description">Deskripsi <span className={styles.meta}>(opsional)</span></label>
          <textarea id="description" className="textarea" rows={4} maxLength={2000} value={draft.description} onChange={event => set({ description: event.target.value })} />
        </div>
        <p className={panel.noteBlue} style={{ margin: 0 }}>Agenda personal mengikuti daftar peserta sesi. Dokumen sesi hanya terlihat oleh peserta sesi ini.</p>
      </section>

      <aside className={`${styles.card} ${panel.aside} ${styles.section}`} aria-labelledby="pemeriksaan">
        <h2 id="pemeriksaan" style={{ margin: 0 }}>Pemeriksaan otomatis</h2>
        <ul className={panel.checks}>{checks.map(check => <li key={check.text} className={panel[check.tone]}>{checkIcon(check.tone)}<span>{check.text}</span></li>)}</ul>
        <p className={panel.noteBrass} style={{ margin: 0 }}>{status === "terbit" ? <>Bila jam atau ruang diubah, {count} peserta menerima notifikasi &ldquo;Jadwal berubah&rdquo;.</> : <>Saat terbit, {count} peserta menerima notifikasi dan sesi masuk ke agenda mereka.</>}</p>
        <p className={panel.noteBlue} style={{ margin: 0 }}>QR absen tetap sama untuk sesi ini dan bisa dicetak dari &ldquo;QR dan daftar hadir&rdquo;.</p>
      </aside>
    </div>

    <div className={styles.sticky}>
      {status === "terbit"
        ? <Button type="submit" disabled={!!busy}>{busy === "save" ? "Menyimpan…" : "Simpan perubahan"}</Button>
        : <>
          <Button type="submit" variant="secondary" disabled={!!busy}>{busy === "save" ? "Menyimpan…" : "Simpan draf"}</Button>
          <Button type="button" disabled={!!busy} onClick={() => save(true)}><Send size={16} aria-hidden /> {busy === "publish" ? "Menerbitkan…" : "Terbitkan sesi"}</Button>
        </>}
      {session && status === "terbit" && <button type="button" className="button button--quiet" disabled={!!busy} onClick={() => changeStatus("draf")}>{busy === "draf" ? "Mengembalikan…" : "Kembalikan ke draf"}</button>}
      {session && status !== "batal" && <button type="button" className="button button--quiet" disabled={!!busy} onClick={() => changeStatus("batal")}>{busy === "batal" ? "Membatalkan…" : "Batalkan sesi"}</button>}
      {session && status !== "terbit" && <button type="button" className={`button button--quiet ${styles.dangerQuiet}`} disabled={!!busy} onClick={removeSession}>{busy === "hapus" ? "Menghapus…" : "Hapus sesi"}</button>}
    </div>
    {confirmDialog}
  </form>;
}
