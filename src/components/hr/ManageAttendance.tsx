"use client";

import { useMemo, useState } from "react";
import { Check, ImageOff, RefreshCw, ScanFace, Trash2, X } from "lucide-react";
import { Notice } from "@/components/ui";
import { Card, ConsoleButton, ConsoleButtonLink, FilterChips, PageHeader, Pill, SegmentedControl, type ConsoleTone, type Crumb } from "@/components/console";
import { ManageTabs } from "./ManageTabs";
import { adminRequest, errorMessage } from "@/components/admin/shared/api";
import { imageProblemLabels, loadFaceEngine } from "@/components/hr/faceEngine";
import {
  faceStatusLabels, flagLabels, kindLabels, reasonLabels, statusLabels,
  type DailyKind, type DailyRecord, type DailyStatus, type DayPerson, type DayView, type FaceRow, type FaceStatus,
} from "@/lib/hr/attendance";
import { scoreLabel } from "@/lib/hr/face-match";
import { distanceLabel } from "@/lib/hr/geo";
import { hrApi } from "@/lib/routes";
import css from "./manage.module.css";

type Message = { tone: "success" | "error"; text: string } | null;
type Filter = "semua" | "perlu" | "belum";
type Open = { employeeId: string; kind: DailyKind } | null;

const time = (iso: string) => new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(new Date(iso));
const statusTone: Record<DailyStatus, ConsoleTone> = { sah: "ok", perlu_cek: "warn", ditolak: "bad" };
const faceTone: Record<FaceStatus, ConsoleTone> = { aktif: "ok", siap: "blue", menunggu: "warn", impor: "neutral", ditolak: "bad" };
const waits = (person: DayPerson) => [person.masuk, person.pulang].some(record => record?.status === "perlu_cek");

/**
 * HR Werkudara → Kelola (20 Nov 2026). Tab Hari: everyone who should clock in, their masuk and
 * pulang, with the clock-ins that wait ("Perlu dicek") to approve or refuse, and a hand record for
 * a missing one. Tab Wajah terdaftar: the reference faces, approving a self-enrolment, and "Proses
 * foto impor", which reads the GreatDay photos in this browser with the same engine as the phones.
 */
export function ManageAttendance({ initial, faces: initialFaces, crumbs = [] }: { initial: DayView; faces: FaceRow[]; crumbs?: readonly Crumb[] }) {
  const [tab, setTab] = useState<"hari" | "wajah">("hari");
  const [day, setDay] = useState(initial);
  const [faces, setFaces] = useState(initialFaces);
  const [filter, setFilter] = useState<Filter>("semua");
  const [open, setOpen] = useState<Open>(null);
  const [note, setNote] = useState("");
  const [manualTime, setManualTime] = useState("08:00");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<Message>(null);
  const [progress, setProgress] = useState<string | null>(null);

  const counts = useMemo(() => ({
    semua: day.people.length,
    perlu: day.people.filter(waits).length,
    belum: day.people.filter(person => !person.masuk).length,
  }), [day.people]);
  const shown = day.people.filter(person => filter === "semua" || (filter === "perlu" ? waits(person) : !person.masuk));

  async function run<T>(key: string, action: () => Promise<T>, after?: (value: T) => void) {
    setBusy(key); setMessage(null);
    try { const value = await action(); after?.(value); }
    catch (error) { setMessage({ tone: "error", text: errorMessage(error) }); }
    finally { setBusy(null); }
  }
  const loadDay = (date: string) => run("hari", async () => (await adminRequest<DayView>(hrApi.manage.day(date))).data as DayView, value => { setDay(value); setOpen(null); });
  const loadFaces = () => run("wajah", async () => (await adminRequest<FaceRow[]>(hrApi.manage.faces)).data ?? [], setFaces);

  const review = (record: DailyRecord, status: "sah" | "ditolak") => run(`review-${record.id}`, async () => {
    const result = await adminRequest<DailyRecord>(hrApi.manage.record(record.id), { method: "PATCH", body: JSON.stringify({ status, note }) });
    return result;
  }, result => {
    setDay(value => ({ ...value, people: value.people.map(person => ({ ...person, masuk: person.masuk?.id === record.id ? result.data ?? null : person.masuk, pulang: person.pulang?.id === record.id ? result.data ?? null : person.pulang })) }));
    setNote(""); setMessage({ tone: "success", text: result.message });
  });

  const manual = (person: DayPerson, kind: DailyKind) => run(`manual-${person.employeeId}-${kind}`, async () =>
    adminRequest<DailyRecord>(hrApi.manage.manual, { method: "POST", body: JSON.stringify({ employeeId: person.employeeId, workDate: day.date, kind, time: manualTime, zone: "WIB", note }) }),
  result => {
    setDay(value => ({ ...value, people: value.people.map(item => item.employeeId === person.employeeId ? { ...item, [kind]: result.data ?? null } : item) }));
    setNote(""); setOpen(null); setMessage({ tone: "success", text: result.message });
  });

  const asReference = (record: DailyRecord) => run(`acuan-${record.id}`, async () => adminRequest<null>(hrApi.manage.asReference(record.id), { method: "POST", body: "{}" }),
    result => setMessage({ tone: "success", text: result.message }));

  const decide = (row: FaceRow, action: "setujui" | "tolak" | "reset") => {
    if (action === "reset" && !window.confirm(`Hapus wajah acuan ${row.name}? Orangnya perlu daftar wajah lagi sebelum absen dengan wajah.`)) return;
    return run(`${action}-${row.employeeId}`, async () => {
    const body = action === "tolak" ? { action, note: note || "Foto tidak jelas" } : { action };
    return adminRequest<null>(hrApi.manage.face(row.employeeId), { method: "POST", body: JSON.stringify(body) });
    }, result => { setNote(""); setMessage({ tone: "success", text: result.message }); void loadFaces(); });
  };

  /** Kelola → "Hapus selfie lama": the selfies older than 90 days, at Admin HR's press (no schedule). */
  const deleteOld = () => {
    if (!window.confirm("Hapus semua selfie absen yang lebih dari 90 hari? Jam, lokasi, dan status absennya tetap tersimpan. Selfie yang terhapus tidak bisa dikembalikan.")) return;
    return run("selfie-lama", async () => adminRequest<{ deleted: number }>(hrApi.manage.oldSelfies, { method: "POST", body: "{}" }), result => setMessage({ tone: "success", text: result.message }));
  };

  /** Reads every imported photo here, one by one, with the phones' engine; the server keeps only the result. */
  const processImports = () => run("proses", async () => {
    const waiting = faces.filter(row => row.source === "greatday" && row.status === "impor" && row.hasPhoto);
    if (!waiting.length) return "Tidak ada foto impor yang menunggu.";
    setProgress("Memuat pengenal wajah…");
    const engine = await loadFaceEngine();
    let ready = 0, unreadable = 0;
    for (const [index, row] of waiting.entries()) {
      setProgress(`Memproses ${index + 1} dari ${waiting.length}: ${row.name}`);
      const response = await fetch(hrApi.manage.facePhoto(row.employeeId), { credentials: "same-origin", cache: "no-store" });
      const check = response.ok ? await engine.analyzeImage(await response.blob()) : { ok: false as const, reason: "tidak_terbaca" as const };
      const body = check.ok ? { action: "proses", embedding: check.embedding } : { action: "proses", problem: imageProblemLabels[check.reason] };
      await adminRequest(hrApi.manage.face(row.employeeId), { method: "POST", body: JSON.stringify(body) });
      if (check.ok) ready += 1; else unreadable += 1;
    }
    return `${ready} foto terbaca dan siap; ${unreadable} tidak terbaca (orangnya diminta daftar wajah sendiri).`;
  }, text => { setProgress(null); setMessage({ tone: "success", text }); void loadFaces(); });

  const slot = (person: DayPerson, kind: DailyKind) => {
    const record = person[kind];
    const isOpen = open?.employeeId === person.employeeId && open.kind === kind;
    return <button type="button" className={css.slot} aria-expanded={isOpen} onClick={() => { setNote(""); setOpen(isOpen ? null : { employeeId: person.employeeId, kind }); }}>
      <span className={css.slotLabel}>{kindLabels[kind]}</span>
      {record ? <>
        <span className={css.slotTime}>{time(record.at)}</span>
        <span className={css.muted}>{record.method === "manual" ? "Dicatat Admin HR" : record.reasonKind ? `${reasonLabels[record.reasonKind]}${record.reasonText ? ` · ${record.reasonText}` : ""}` : record.officeName ?? "—"}</span>
        <Pill tone={statusTone[record.status]}>{statusLabels[record.status]}</Pill>
      </> : <span className={css.muted}>Belum</span>}
    </button>;
  };

  const detail = (person: DayPerson, kind: DailyKind) => {
    const record = person[kind];
    if (!record) return <div className={css.detail}>
      <p className={css.muted}>Belum ada absen {kindLabels[kind].toLowerCase()}. Catat manual bila orangnya hadir (HP rusak, belum setuju data wajah, lupa absen).</p>
      <div className={css.actions}>
        <label className={css.field}>Jam (WIB)<input type="time" value={manualTime} onChange={event => setManualTime(event.target.value)} /></label>
        <label className={`${css.field} ${css.grow}`}>Alasan<input type="text" maxLength={300} value={note} onChange={event => setNote(event.target.value)} placeholder="Mis. HP rusak" /></label>
        <ConsoleButton variant="primary" disabled={busy !== null || note.trim().length < 3} onClick={() => void manual(person, kind)}>Catat manual</ConsoleButton>
      </div>
    </div>;
    return <div className={css.detail}>
      <div className={css.photos}>
        {record.hasSelfie
          // eslint-disable-next-line @next/next/no-img-element -- a five-minute storage address; next/image would cache it
          ? <figure><img src={hrApi.manage.selfie(record.id)} alt={`Selfie absen ${kindLabels[kind].toLowerCase()} ${person.name}`} /><figcaption>Selfie absen</figcaption></figure>
          : <figure><span className={css.muted}><ImageOff size={16} aria-hidden /> Tanpa selfie</span></figure>}
        {/* eslint-disable-next-line @next/next/no-img-element -- a five-minute storage address; next/image would cache it */}
        {person.face && <figure><img src={hrApi.manage.facePhoto(person.employeeId, true)} alt={`Foto acuan ${person.name}`} /><figcaption>Foto acuan</figcaption></figure>}
      </div>
      <dl className={css.facts}>
        {record.faceScore !== null && <><dt>Skor wajah</dt><dd>{scoreLabel(record.faceScore)}</dd></>}
        {record.distanceM !== null && <><dt>Jarak</dt><dd>{distanceLabel(record.distanceM)}{record.officeName ? ` dari ${record.officeName}` : ""}</dd></>}
        {record.accuracyM !== null && <><dt>Akurasi GPS</dt><dd>±{distanceLabel(record.accuracyM)}</dd></>}
        {record.flags.length > 0 && <><dt>Catatan</dt><dd>{record.flags.map(flag => flagLabels[flag]).join(", ")}</dd></>}
        {record.reviewNote && <><dt>Keterangan admin</dt><dd>{record.reviewNote}</dd></>}
      </dl>
      <div className={css.actions}>
        <label className={`${css.field} ${css.grow}`}>Catatan (wajib untuk Tolak)<input type="text" maxLength={300} value={note} onChange={event => setNote(event.target.value)} /></label>
        {record.status !== "sah" && <ConsoleButton variant="primary" icon={<Check size={16} aria-hidden />} disabled={busy !== null} onClick={() => void review(record, "sah")}>Setujui</ConsoleButton>}
        {record.status !== "ditolak" && <ConsoleButton icon={<X size={16} aria-hidden />} disabled={busy !== null || note.trim().length < 3} onClick={() => void review(record, "ditolak")}>Tolak</ConsoleButton>}
        {record.hasSelfie && record.method === "wajah" && <ConsoleButton icon={<ScanFace size={16} aria-hidden />} disabled={busy !== null} onClick={() => void asReference(record)}>Jadikan foto acuan</ConsoleButton>}
      </div>
    </div>;
  };

  return <>
    <PageHeader crumbs={crumbs} title="Absen harian"
      subtitle="Absen masuk dan pulang karyawan dengan wajah dan titik kantor. Yang di luar area atau skornya rendah menunggu dicek."
      actions={<ConsoleButton icon={<Trash2 size={16} aria-hidden />} disabled={busy !== null} onClick={() => void deleteOld()}>Hapus selfie lama</ConsoleButton>} />
    <ManageTabs current="absen" />
    {message && <Notice tone={message.tone}>{message.text}</Notice>}
    <SegmentedControl label="Tampilan" value={tab} onChange={setTab} options={[{ value: "hari", label: "Hari" }, { value: "wajah", label: "Wajah terdaftar" }]} />

    {tab === "hari" ? <Card title={`Absen ${new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${day.date}T12:00:00Z`))}`}>
      <div className={css.toolbar}>
        <label className={css.date}>Tanggal<input type="date" value={day.date} onChange={event => event.target.value && void loadDay(event.target.value)} /></label>
        <FilterChips label="Saring" value={filter} onChange={setFilter} chips={[
          { value: "semua", label: "Semua", count: counts.semua },
          { value: "perlu", label: "Perlu dicek", count: counts.perlu },
          { value: "belum", label: "Belum absen", count: counts.belum },
        ]} />
        <ConsoleButton icon={<RefreshCw size={16} aria-hidden />} disabled={busy !== null} onClick={() => void loadDay(day.date)}>Muat ulang</ConsoleButton>
      </div>
      {day.offices.length === 0 && <Notice tone="warning">Belum ada titik kantor, jadi semua absen terhitung di luar area. Atur di Titik kantor.</Notice>}
      {shown.length === 0 ? <p className={css.muted}>Tidak ada yang cocok dengan saringan ini.</p> : <ul className={css.rows}>
        {shown.map(person => <li key={person.employeeId} className={css.row}>
          <div className={css.rowHead}>
            <strong>{person.name}</strong>
            <span className={css.muted}>{person.department}{person.face ? "" : " · belum ada data wajah"}</span>
          </div>
          <div className={css.slots}>{slot(person, "masuk")}{slot(person, "pulang")}</div>
          {open?.employeeId === person.employeeId && detail(person, open.kind)}
        </li>)}
      </ul>}
    </Card> : <Card title={`Wajah terdaftar (${faces.length})`}>
      <div className={css.toolbar}>
        <ConsoleButton variant="primary" icon={<ScanFace size={16} aria-hidden />} disabled={busy !== null} onClick={() => void processImports()}>
          Proses foto impor ({faces.filter(row => row.status === "impor").length})
        </ConsoleButton>
        <ConsoleButton icon={<RefreshCw size={16} aria-hidden />} disabled={busy !== null} onClick={() => void loadFaces()}>Muat ulang</ConsoleButton>
        <label className={`${css.field} ${css.grow}`}>Alasan tolak<input type="text" maxLength={300} value={note} onChange={event => setNote(event.target.value)} placeholder="Mis. foto bukan wajahnya" /></label>
      </div>
      {progress && <p className={css.progress} role="status">{progress}</p>}
      <p className={css.muted}>Foto impor dibaca di browser ini dengan pengenal wajah yang sama dengan HP karyawan. Wajah impor baru dipakai setelah karyawannya menyetujui di absen pertamanya.</p>
      {faces.length === 0 ? <p className={css.muted}>Belum ada wajah terdaftar.</p> : <ul className={css.rows}>
        {faces.map(row => <li key={row.employeeId} className={css.row}>
          <div className={css.rowHead}>
            <strong>{row.name}</strong>
            <Pill tone={faceTone[row.status]}>{faceStatusLabels[row.status]}</Pill>
          </div>
          <p className={css.muted}>{row.department} · {row.source === "greatday" ? "Foto GreatDay" : "Daftar sendiri"}{row.consented ? " · sudah setuju" : ""}{row.note ? ` · ${row.note}` : ""}</p>
          <div className={css.actions}>
            {row.hasPhoto && <ConsoleButtonLink href={hrApi.manage.facePhoto(row.employeeId, true)} target="_blank" rel="noopener">Lihat foto</ConsoleButtonLink>}
            {row.status === "menunggu" && <ConsoleButton variant="primary" disabled={busy !== null} onClick={() => void decide(row, "setujui")}>Setujui</ConsoleButton>}
            {row.status === "menunggu" && <ConsoleButton disabled={busy !== null} onClick={() => void decide(row, "tolak")}>Tolak</ConsoleButton>}
            <ConsoleButton disabled={busy !== null} onClick={() => void decide(row, "reset")}>Hapus, daftar ulang</ConsoleButton>
          </div>
        </li>)}
      </ul>}
    </Card>}
  </>;
}
