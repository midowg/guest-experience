"use client";

import { useId, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Card, ConsoleButton, FilterChips, Pill, SegmentedControl } from "@/components/console";
import { Notice } from "@/components/ui";
import { adminRequest, errorMessage } from "@/components/admin/shared/api";
import { adminRange, adminWhen, WAITING_TEXT } from "@/lib/main-wam/modul/admin";
import type { MissionInput, SettingsInput } from "@/lib/main-wam/misi/schema";
import { MISSION_KINDS, type CompletionStatus, type MissionKind } from "@/lib/main-wam/misi/types";
import { wibDate, wibTime } from "@/lib/main-wam/rundown";
import { mainWamAdminApi } from "@/lib/routes";
import type { AdminCompletion, AdminMisi, AdminMissionRow } from "@/lib/server/main-wam/misi/admin";
import css from "./misi-admin.module.css";

type Message = { tone: "success" | "error"; text: string } | null;
type Tab = "misi" | "bukti" | "peringkat" | "pengaturan";

/** "2027-01-06T08:00" (WIB, for <input type="datetime-local">) ↔ an ISO instant. */
const toLocal = (iso: string | null) => (iso ? `${wibDate(iso)}T${wibTime(iso)}` : "");
const fromLocal = (value: string) => (value ? `${value}:00+07:00` : null);

export const kindWords: Record<MissionKind, string> = { foto: "Foto langsung", checkin: "Check-in lokasi", sesi: "Sesi" };
const statusWords: Record<CompletionStatus, string> = { menunggu: "Menunggu", disetujui: "Disetujui", ditolak: "Ditolak" };
const statusTone = { menunggu: "warn", disetujui: "ok", ditolak: "bad" } as const;
const sourceWords = { foto: "Foto", lokasi: "Lokasi", absen: "Absen otomatis", panitia: "Dicatat panitia" } as const;

/**
 * Admin WAM 2026 → Misi: the missions (kind, points, place and radius, session, window), the
 * proofs people sent (approve or reject, a rejected one may be sent again), the Peringkat with points
 * by hand, and the settings (the default radius, the worst location accuracy, whether the Peringkat
 * is open). Full names (aturan-wam §4). The numbers are example values until the owner decides.
 */
export function MissionsAdmin({ initial }: { initial: AdminMisi }) {
  const [data, setData] = useState(initial);
  const [tab, setTab] = useState<Tab>("misi");
  const [message, setMessage] = useState<Message>(null);
  const [busy, setBusy] = useState(false);
  const waiting = data.completions.filter(item => item.status === "menunggu").length;

  async function reload(text: string) {
    const fresh = await adminRequest<AdminMisi>(mainWamAdminApi.missions);
    setData(fresh.data!);
    setMessage({ tone: "success", text });
  }
  async function run(action: () => Promise<string>) {
    setBusy(true); setMessage(null);
    try { await reload(await action()); return true; }
    catch (problem) { setMessage({ tone: "error", text: errorMessage(problem) }); return false; }
    finally { setBusy(false); }
  }
  const call = (url: string, method: string, body?: unknown) => async () => (await adminRequest(url, { method, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) })).message;

  return <div className={css.stack}>
    {!data.migrated && <Notice tone="warning">{WAITING_TEXT}</Notice>}
    <div aria-live="polite">{message && <Notice tone={message.tone}>{message.text}</Notice>}</div>
    <SegmentedControl<Tab> label="Bagian Misi" value={tab} onChange={setTab} options={[
      { value: "misi", label: `Misi (${data.missions.length})` }, { value: "bukti", label: waiting ? `Bukti (${waiting} menunggu)` : "Bukti" },
      { value: "peringkat", label: "Peringkat dan poin" }, { value: "pengaturan", label: "Pengaturan" },
    ]} />
    {tab === "misi" && <MissionsTab data={data} busy={busy} run={run} call={call} />}
    {tab === "bukti" && <ProofsTab data={data} busy={busy} run={run} call={call} />}
    {tab === "peringkat" && <RankTab data={data} busy={busy} run={run} call={call} />}
    {tab === "pengaturan" && <SettingsTab data={data} busy={busy} run={run} call={call} />}
  </div>;
}

type TabProps = {
  data: AdminMisi; busy: boolean;
  run: (action: () => Promise<string>) => Promise<boolean>;
  call: (url: string, method: string, body?: unknown) => () => Promise<string>;
};

/* ── Misi ─────────────────────────────────────────────────────────────────────────────────────── */

function MissionsTab({ data, busy, run, call }: TabProps) {
  const [editing, setEditing] = useState<string | "baru" | null>(null);
  const [granting, setGranting] = useState<string | null>(null);
  const sessions = useMemo(() => new Map(data.sessions.map(session => [session.id, session])), [data.sessions]);
  return <>
    <p className={css.note}>Peserta mengerjakan misi aktif satu kali. Poin masuk lewat catatan poin (saldo = jumlah catatan). Misi yang sudah punya penyelesaian tidak bisa dihapus, hanya dimatikan.</p>
    {data.missions.map(mission => <Card key={mission.id} title={mission.title} id={`misi-${mission.id}`}>
      <div className={css.badges}>
        <Pill tone={mission.active ? "ok" : "neutral"}>{mission.active ? "Aktif" : "Mati"}</Pill>
        <Pill tone="blue">{kindWords[mission.kind]}</Pill>
        <Pill tone="brass">{mission.points} poin</Pill>
        {mission.review && <Pill tone="warn">Ditinjau dulu</Pill>}
      </div>
      <p className={css.meta}>
        {mission.latitude !== null && <span>{mission.placeName || "Titik"} · {mission.latitude.toFixed(5)}, {mission.longitude?.toFixed(5)} · radius {mission.radiusM ?? data.settings.defaultRadiusM} m{mission.radiusM === null ? " (bawaan)" : ""}</span>}
        {mission.kind === "sesi" && <span>Sesi: {mission.sessionId ? sessions.get(mission.sessionId)?.title ?? "–" : "belum dipilih"} · dicatat {mission.credit === "absen" ? "otomatis dari absen" : "panitia"}</span>}
        {(mission.opensAt || mission.closesAt) && <span>Berlaku {mission.opensAt && mission.closesAt ? adminRange(mission.opensAt, mission.closesAt) : mission.closesAt ? `sampai ${adminWhen(mission.closesAt)}` : `mulai ${adminWhen(mission.opensAt)}`}</span>}
        <span>Selesai {mission.done} · menunggu {mission.pending} · ditolak {mission.rejected}</span>
      </p>
      {mission.description && <p className={css.note}>{mission.description}</p>}
      {editing === mission.id && <MissionForm mission={mission} data={data} busy={busy} onCancel={() => setEditing(null)}
        onSave={input => run(call(mainWamAdminApi.mission(mission.id), "PATCH", input)).then(ok => { if (ok) setEditing(null); })} />}
      {granting === mission.id && <GrantForm mission={mission} data={data} busy={busy} onCancel={() => setGranting(null)}
        onSave={body => run(call(mainWamAdminApi.missionGrant(mission.id), "POST", body)).then(ok => { if (ok) setGranting(null); })} />}
      {editing !== mission.id && granting !== mission.id && <div className={css.actions}>
        <ConsoleButton disabled={busy || !data.migrated} onClick={() => { setGranting(null); setEditing(mission.id); }}>Ubah</ConsoleButton>
        <ConsoleButton disabled={busy || !data.migrated} onClick={() => { setEditing(null); setGranting(mission.id); }}>Catat selesai</ConsoleButton>
        <ConsoleButton disabled={busy || !data.migrated} icon={<Trash2 size={16} aria-hidden />}
          onClick={() => { if (window.confirm(`Hapus misi ${mission.title}?`)) void run(call(mainWamAdminApi.mission(mission.id), "DELETE")); }}>Hapus</ConsoleButton>
      </div>}
    </Card>)}
    {!data.missions.length && data.migrated && <p className={css.note}>Belum ada misi. Tambahkan misi pertama.</p>}
    {editing === "baru"
      ? <Card title="Misi baru" id="misi-baru"><MissionForm mission={null} data={data} busy={busy} onCancel={() => setEditing(null)}
        onSave={input => run(call(mainWamAdminApi.missions, "POST", input)).then(ok => { if (ok) setEditing(null); })} /></Card>
      : <div><ConsoleButton variant="primary" icon={<Plus size={16} aria-hidden />} disabled={busy || !data.migrated} onClick={() => setEditing("baru")}>Tambah misi</ConsoleButton></div>}
  </>;
}

function MissionForm({ mission, data, busy, onSave, onCancel }: { mission: AdminMissionRow | null; data: AdminMisi; busy: boolean; onSave: (input: MissionInput) => void; onCancel: () => void }) {
  const id = useId();
  const [form, setForm] = useState(() => ({
    title: mission?.title ?? "", description: mission?.description ?? "", kind: (mission?.kind ?? "foto") as MissionKind, points: String(mission?.points ?? 20),
    placeName: mission?.placeName ?? "", latitude: mission?.latitude?.toString() ?? "", longitude: mission?.longitude?.toString() ?? "", radiusM: mission?.radiusM?.toString() ?? "",
    sessionId: mission?.sessionId ?? "", credit: mission?.credit ?? "panitia" as const, review: mission?.review ?? false,
    opensAt: toLocal(mission?.opensAt ?? null), closesAt: toLocal(mission?.closesAt ?? null), sort: String(mission?.sort ?? data.missions.length + 1), active: mission?.active ?? false,
  }));
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm(current => ({ ...current, [key]: value }));
  const number = (text: string) => (text.trim() === "" ? null : Number(text.replace(",", ".")));
  const submit = () => onSave({
    title: form.title, description: form.description, kind: form.kind, points: Number(form.points), placeName: form.placeName, latitude: number(form.latitude), longitude: number(form.longitude),
    radiusM: number(form.radiusM), sessionId: form.sessionId || null, credit: form.credit, review: form.review, opensAt: fromLocal(form.opensAt), closesAt: fromLocal(form.closesAt),
    sort: Number(form.sort) || 0, active: form.active,
  });
  const places = form.kind !== "sesi";
  return <form className={css.form} onSubmit={event => { event.preventDefault(); submit(); }}>
    <div className={css.formGrid}>
      <div className="field"><label htmlFor={`${id}-nama`}>Nama misi</label><input id={`${id}-nama`} className="input" required maxLength={100} value={form.title} onChange={event => set("title", event.target.value)} placeholder="Foto apel Kota Batu" /></div>
      <div className="field"><label htmlFor={`${id}-jenis`}>Jenis</label>
        <select id={`${id}-jenis`} className="select" value={form.kind} onChange={event => set("kind", event.target.value as MissionKind)}>
          {MISSION_KINDS.map(kind => <option key={kind} value={kind}>{kindWords[kind]}</option>)}
        </select></div>
      <div className="field"><label htmlFor={`${id}-poin`}>Poin</label><input id={`${id}-poin`} className="input" type="number" min={0} max={1000} required value={form.points} onChange={event => set("points", event.target.value)} /></div>
    </div>
    <div className="field"><label htmlFor={`${id}-isi`}>Penjelasan untuk peserta</label><input id={`${id}-isi`} className="input" maxLength={500} value={form.description} onChange={event => set("description", event.target.value)} placeholder="Foto dirimu atau timmu di depan tugu apel." /></div>
    {places && <div className={css.formGrid}>
      <div className="field"><label htmlFor={`${id}-tempat`}>Nama tempat</label><input id={`${id}-tempat`} className="input" maxLength={100} value={form.placeName} onChange={event => set("placeName", event.target.value)} placeholder="Alun-alun Batu" /></div>
      <div className="field"><label htmlFor={`${id}-lat`}>Garis lintang{form.kind === "checkin" ? "" : " (opsional)"}</label><input id={`${id}-lat`} className="input" inputMode="decimal" value={form.latitude} onChange={event => set("latitude", event.target.value)} placeholder="-7.87070" /></div>
      <div className="field"><label htmlFor={`${id}-lng`}>Garis bujur{form.kind === "checkin" ? "" : " (opsional)"}</label><input id={`${id}-lng`} className="input" inputMode="decimal" value={form.longitude} onChange={event => set("longitude", event.target.value)} placeholder="112.52830" /></div>
      <div className="field"><label htmlFor={`${id}-radius`}>Radius (m)</label><input id={`${id}-radius`} className="input" inputMode="numeric" value={form.radiusM} onChange={event => set("radiusM", event.target.value)} placeholder={`${data.settings.defaultRadiusM} (bawaan)`} /></div>
    </div>}
    {places && <p className={css.small}>{form.kind === "checkin" ? "Titik wajib: peserta hanya bisa check-in di dalam radius." : "Tanpa titik, foto cukup dengan lokasi aktif (lokasi tetap dicatat). Dengan titik, foto harus diambil di dalam radius."} Salin titik dari Google Maps (klik kanan pada tempatnya).</p>}
    {form.kind === "sesi" && <div className={css.formGrid}>
      <div className="field"><label htmlFor={`${id}-sesi`}>Sesi</label>
        <select id={`${id}-sesi`} className="select" value={form.sessionId} onChange={event => set("sessionId", event.target.value)}>
          <option value="">Pilih sesi</option>
          {data.sessions.map(session => <option key={session.id} value={session.id}>{session.title} · {adminWhen(session.startsAt)}</option>)}
        </select></div>
      <div className="field"><label htmlFor={`${id}-catat`}>Siapa yang mencatat</label>
        <select id={`${id}-catat`} className="select" value={form.credit} onChange={event => set("credit", event.target.value as "panitia" | "absen")}>
          <option value="panitia">Panitia (lewat Catat selesai)</option>
          <option value="absen">Otomatis dari absen sesi</option>
        </select></div>
    </div>}
    <div className={css.formGrid}>
      <div className="field"><label htmlFor={`${id}-buka`}>Mulai berlaku (WIB)</label><input id={`${id}-buka`} className="input" type="datetime-local" value={form.opensAt} onChange={event => set("opensAt", event.target.value)} /></div>
      <div className="field"><label htmlFor={`${id}-tutup`}>Berlaku sampai (WIB)</label><input id={`${id}-tutup`} className="input" type="datetime-local" value={form.closesAt} onChange={event => set("closesAt", event.target.value)} /></div>
      <div className="field"><label htmlFor={`${id}-urut`}>Urutan</label><input id={`${id}-urut`} className="input" type="number" min={0} max={999} value={form.sort} onChange={event => set("sort", event.target.value)} /></div>
    </div>
    {form.kind === "foto" && <label className={css.check}><input type="checkbox" checked={form.review} onChange={event => set("review", event.target.checked)} />Tinjau fotonya dulu (poin masuk setelah disetujui)</label>}
    <label className={css.check}><input type="checkbox" checked={form.active} onChange={event => set("active", event.target.checked)} />Aktif (tampil di aplikasi peserta)</label>
    <div className={css.actions}>
      <ConsoleButton type="submit" variant="primary" disabled={busy || !form.title.trim()}>{busy ? "Menyimpan…" : "Simpan"}</ConsoleButton>
      <ConsoleButton onClick={onCancel} disabled={busy}>Batal</ConsoleButton>
    </div>
  </form>;
}

function GrantForm({ mission, data, busy, onSave, onCancel }: { mission: AdminMissionRow; data: AdminMisi; busy: boolean; onSave: (body: { employeeId: string; note: string }) => void; onCancel: () => void }) {
  const id = useId();
  const [typed, setTyped] = useState("");
  const [note, setNote] = useState("");
  const options = data.people.map(person => ({ ...person, label: `${person.fullName} · ${person.department || "Tanpa departemen"}` }));
  const picked = options.find(person => person.label === typed);
  return <div className={css.form}>
    <p className={css.small}>Catat bahwa seseorang sudah mengerjakan “{mission.title}”. {mission.points} poin masuk saat itu juga.</p>
    <div className={css.pick}>
      <div className="field">
        <label htmlFor={`${id}-orang`}>Orang</label>
        <input id={`${id}-orang`} className="input" list={`${id}-daftar`} value={typed} placeholder="Ketik nama karyawan" autoComplete="off" onChange={event => setTyped(event.target.value)} />
        <datalist id={`${id}-daftar`}>{options.map(person => <option key={person.id} value={person.label} />)}</datalist>
      </div>
      <div className="field"><label htmlFor={`${id}-catatan`}>Catatan (opsional)</label><input id={`${id}-catatan`} className="input" maxLength={300} value={note} onChange={event => setNote(event.target.value)} /></div>
    </div>
    <div className={css.actions}>
      <ConsoleButton variant="primary" disabled={busy || !picked} onClick={() => picked && onSave({ employeeId: picked.id, note })}>{busy ? "Menyimpan…" : "Catat selesai"}</ConsoleButton>
      <ConsoleButton onClick={onCancel} disabled={busy}>Batal</ConsoleButton>
    </div>
  </div>;
}

/* ── Bukti ────────────────────────────────────────────────────────────────────────────────────── */

type ProofFilter = "menunggu" | "semua" | "ditolak" | "disetujui";

function ProofsTab({ data, busy, run, call }: TabProps) {
  const [filter, setFilter] = useState<ProofFilter>("menunggu");
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const counts = (status: CompletionStatus) => data.completions.filter(item => item.status === status).length;
  const shown = data.completions.filter(item => filter === "semua" || item.status === filter);
  return <>
    <p className={css.note}>Foto yang dikirim peserta. Misi “Tinjau dulu” menunggu di sini; yang lain sudah berpoin dan bisa ditolak kapan saja (poin dikembalikan, peserta boleh kirim ulang). Foto hanya terlihat di sini, tidak di Momen.</p>
    <FilterChips<ProofFilter> label="Saring bukti" value={filter} onChange={setFilter} chips={[
      { value: "menunggu", label: "Menunggu", count: counts("menunggu") }, { value: "semua", label: "Semua", count: data.completions.length },
      { value: "ditolak", label: "Ditolak", count: counts("ditolak") }, { value: "disetujui", label: "Disetujui", count: counts("disetujui") },
    ]} />
    {!shown.length && <p className={css.note}>Tidak ada yang cocok.</p>}
    <ul className={css.rows} aria-label="Penyelesaian misi">
      {shown.map(item => <li key={item.id} className={css.proof}>
        {item.hasProof
          // eslint-disable-next-line @next/next/no-img-element -- a short-lived storage address behind the admin API
          ? <a href={mainWamAdminApi.missionProof(item.id)} target="_blank" rel="noreferrer"><img className={css.thumb} src={mainWamAdminApi.missionProof(item.id)} alt={`Foto ${item.person} untuk ${item.missionTitle}`} loading="lazy" /></a>
          : <span className={css.thumb} aria-hidden />}
        <span className={css.rowText}>
          <span>{item.person} · {item.department || "–"}</span>
          <span>{item.missionTitle} · {sourceWords[item.source]} · {adminWhen(item.createdAt)}</span>
          {item.distanceM !== null && <span>{item.distanceM} m dari titik · lokasi ±{item.accuracyM ?? "?"} m</span>}
          {item.note && <span>Catatan: {item.note}</span>}
          {item.reviewNote && <span>Alasan tolak: {item.reviewNote}{item.reviewedBy ? ` (${item.reviewedBy})` : ""}</span>}
          {rejecting === item.id && <span className={css.inline}>
            <input className="input" aria-label={`Alasan menolak ${item.person}`} maxLength={300} placeholder="Alasan (opsional), dibaca peserta" value={note} onChange={event => setNote(event.target.value)} />
            <ConsoleButton variant="primary" disabled={busy} onClick={() => run(call(mainWamAdminApi.missionCompletion(item.id), "PATCH", { status: "ditolak", note })).then(ok => { if (ok) { setRejecting(null); setNote(""); } })}>Tolak</ConsoleButton>
            <ConsoleButton disabled={busy} onClick={() => { setRejecting(null); setNote(""); }}>Batal</ConsoleButton>
          </span>}
        </span>
        <span className={css.proofSide}>
          <Pill tone={statusTone[item.status]}>{statusWords[item.status]}</Pill>
          {rejecting !== item.id && <span className={css.iconButtons}>
            {item.status !== "disetujui" && <ConsoleButton disabled={busy} onClick={() => run(call(mainWamAdminApi.missionCompletion(item.id), "PATCH", { status: "disetujui", note: "" }))}>Setujui</ConsoleButton>}
            {item.status !== "ditolak" && <ConsoleButton disabled={busy} onClick={() => { setRejecting(item.id); setNote(""); }}>Tolak</ConsoleButton>}
            <ConsoleButton aria-label={`Hapus penyelesaian ${item.person}`} disabled={busy} icon={<Trash2 size={16} aria-hidden />}
              onClick={() => { if (window.confirm(`Hapus penyelesaian ${item.person} untuk ${item.missionTitle}? Poin dan fotonya ikut hilang.`)) void run(call(mainWamAdminApi.missionCompletion(item.id), "DELETE")); }} />
          </span>}
        </span>
      </li>)}
    </ul>
  </>;
}

/* ── Peringkat dan poin ───────────────────────────────────────────────────────────────────────── */

function RankTab({ data, busy, run, call }: TabProps) {
  const id = useId();
  const [typed, setTyped] = useState("");
  const [points, setPoints] = useState("10");
  const [note, setNote] = useState("");
  const options = data.people.map(person => ({ ...person, label: `${person.fullName} · ${person.department || "Tanpa departemen"}` }));
  const picked = options.find(person => person.label === typed);
  return <>
    <Card title="Beri poin manual" id="poin-manual">
      <p className={css.small}>Bonus atau koreksi. Tulis alasannya; angka negatif mengurangi. Tercatat sebagai satu baris di catatan poin dan bisa dibatalkan.</p>
      <div className={css.pick}>
        <div className="field">
          <label htmlFor={`${id}-orang`}>Orang</label>
          <input id={`${id}-orang`} className="input" list={`${id}-daftar`} value={typed} placeholder="Ketik nama karyawan" autoComplete="off" onChange={event => setTyped(event.target.value)} />
          <datalist id={`${id}-daftar`}>{options.map(person => <option key={person.id} value={person.label} />)}</datalist>
        </div>
        <div className="field"><label htmlFor={`${id}-poin`}>Poin</label><input id={`${id}-poin`} className="input" type="number" min={-1000} max={1000} value={points} onChange={event => setPoints(event.target.value)} /></div>
        <div className="field"><label htmlFor={`${id}-alasan`}>Alasan</label><input id={`${id}-alasan`} className="input" maxLength={200} value={note} onChange={event => setNote(event.target.value)} placeholder="Bantu panitia di meja registrasi" /></div>
      </div>
      <div className={css.actions}>
        <ConsoleButton variant="primary" disabled={busy || !picked || !Number(points) || note.trim().length < 2}
          onClick={() => picked && run(call(mainWamAdminApi.missionPoints, "POST", { employeeId: picked.id, points: Number(points), note })).then(ok => { if (ok) { setTyped(""); setNote(""); } })}>Catat poin</ConsoleButton>
      </div>
      {data.manual.length > 0 && <ul className={css.rows} aria-label="Poin manual">
        {data.manual.map(entry => <li key={entry.id} className={css.row}>
          <span className={css.rowText}><span>{entry.person}</span><span>{entry.note}{entry.createdBy ? ` · ${entry.createdBy}` : ""} · {adminWhen(entry.createdAt)}</span></span>
          <span className={css.votes}>{entry.points > 0 ? `+${entry.points}` : entry.points}</span>
          <ConsoleButton aria-label={`Batalkan poin ${entry.person}`} disabled={busy} icon={<Trash2 size={16} aria-hidden />} onClick={() => run(call(mainWamAdminApi.missionPoint(entry.id), "DELETE"))} />
        </li>)}
      </ul>}
    </Card>
    <Card title={`Peringkat (${data.leaderboard.length} peserta)`} id="peringkat">
      <p className={css.small}>Yang dilihat peserta hanya nama panggilan, singkatan departemen, dan poin. Di sini nama lengkap. Sama poin berbagi peringkat.</p>
      {data.leaderboard.length
        ? <ol className={css.rows} aria-label="Peringkat">
          {data.leaderboard.map(person => <li key={person.employeeId} className={css.row}>
            <span className={css.rank}>{person.rank}</span>
            <span className={css.rowText}><span>{person.fullName}</span><span>{person.department || "–"} · {person.missions} misi</span></span>
            <span className={css.votes}>{person.points}</span>
          </li>)}
        </ol>
        : <p className={css.note}>Belum ada peserta.</p>}
    </Card>
  </>;
}

/* ── Pengaturan ───────────────────────────────────────────────────────────────────────────────── */

function SettingsTab({ data, busy, run, call }: TabProps) {
  const id = useId();
  const [form, setForm] = useState({ radius: String(data.settings.defaultRadiusM), accuracy: String(data.settings.maxAccuracyM), open: data.settings.leaderboardOpen });
  const input: SettingsInput = { defaultRadiusM: Number(form.radius), maxAccuracyM: Number(form.accuracy), leaderboardOpen: form.open };
  return <Card title="Pengaturan misi" id="pengaturan">
    <p className={css.small}>Angka awal hanya contoh sampai pemilik memutuskan. Perubahan berlaku untuk misi berikutnya yang dikerjakan.</p>
    <form className={css.form} onSubmit={event => { event.preventDefault(); void run(call(mainWamAdminApi.missionSettings, "PUT", input)); }}>
      <div className={css.formGrid}>
        <div className="field"><label htmlFor={`${id}-radius`}>Radius bawaan (m)</label><input id={`${id}-radius`} className="input" type="number" min={10} max={1000} value={form.radius} onChange={event => setForm({ ...form, radius: event.target.value })} />
          <span className={css.small}>Dipakai misi yang tidak mengisi radius sendiri.</span></div>
        <div className="field"><label htmlFor={`${id}-akurasi`}>Ketelitian lokasi terburuk (m)</label><input id={`${id}-akurasi`} className="input" type="number" min={10} max={1000} value={form.accuracy} onChange={event => setForm({ ...form, accuracy: event.target.value })} />
          <span className={css.small}>Lokasi HP yang lebih kasar dari ini ditolak, supaya radius kecil tidak lolos karena kebetulan.</span></div>
      </div>
      <label className={css.check}><input type="checkbox" checked={form.open} onChange={event => setForm({ ...form, open: event.target.checked })} />Peringkat terbuka untuk peserta</label>
      <div className={css.actions}><ConsoleButton type="submit" variant="primary" disabled={busy || !data.migrated}>{busy ? "Menyimpan…" : "Simpan pengaturan"}</ConsoleButton></div>
    </form>
  </Card>;
}

export type { AdminCompletion };
