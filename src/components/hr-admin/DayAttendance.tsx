"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import { Notice } from "@/components/ui";
import { Card, ConsoleButton, ConsoleButtonLink, FilterChips, PageHeader, Pill, SearchField, type ConsoleTone } from "@/components/console";
import { adminRequest, errorMessage } from "@/components/admin/shared/api";
import { kindLabels, reasonLabels, statusLabels, type DailyKind, type DailyRecord, type DailyStatus, type DayPerson, type DayView } from "@/lib/hr/attendance";
import { hrAdminApi, hrAdminPath } from "@/lib/routes";
import { RecordReview } from "./RecordReview";
import css from "./hr-admin.module.css";

type Message = { tone: "success" | "error"; text: string } | null;
type Filter = "semua" | "belum" | "perlu" | "luar";
type Open = { employeeId: string; kind: DailyKind } | null;

const time = (iso: string) => new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(new Date(iso));
const longDay = (date: string) => new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
const shift = (date: string, days: number) => new Date(Date.parse(`${date}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
const statusTone: Record<DailyStatus, ConsoleTone> = { sah: "ok", perlu_cek: "warn", ditolak: "bad" };
const waits = (person: DayPerson) => [person.masuk, person.pulang].some(record => record?.status === "perlu_cek");
const outside = (person: DayPerson) => [person.masuk, person.pulang].some(record => record?.method === "wajah" && !!record.reasonKind);
const where = (record: DailyRecord) => record.method === "manual" ? "Dicatat manual" : record.reasonKind ? `${reasonLabels[record.reasonKind]}${record.reasonText ? ` · ${record.reasonText}` : ""}` : record.officeName ?? "—";

/**
 * Admin HR → Absen harian (20 Nov 2026): everyone who should clock in, their masuk and pulang on one
 * day. Move a day with ‹ ›, find a name, filter (belum absen, perlu dicek, di luar kantor); open a
 * slot to look at the clock-in and decide it, or to record a missing one by hand.
 */
export function DayAttendance({ initial, today }: { initial: DayView; today: string }) {
  const [day, setDay] = useState(initial);
  const [filter, setFilter] = useState<Filter>("semua");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Open>(null);
  const [note, setNote] = useState("");
  const [manualTime, setManualTime] = useState("08:00");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message>(null);

  const counts = useMemo(() => ({
    semua: day.people.length,
    belum: day.people.filter(person => !person.masuk).length,
    perlu: day.people.filter(waits).length,
    luar: day.people.filter(outside).length,
  }), [day.people]);
  const needle = query.trim().toLowerCase();
  const shown = day.people
    .filter(person => filter === "semua" || (filter === "belum" ? !person.masuk : filter === "perlu" ? waits(person) : outside(person)))
    .filter(person => !needle || `${person.name} ${person.department}`.toLowerCase().includes(needle));

  async function loadDay(date: string) {
    setBusy(true); setMessage(null);
    try {
      const result = await adminRequest<DayView>(hrAdminApi.day(date));
      if (result.data) { setDay(result.data); setOpen(null); window.history.replaceState(null, "", hrAdminPath.day(date)); }
    } catch (error) { setMessage({ tone: "error", text: errorMessage(error) }); }
    finally { setBusy(false); }
  }
  const replace = (record: DailyRecord) => setDay(value => ({
    ...value,
    people: value.people.map(person => ({ ...person, masuk: person.masuk?.id === record.id ? record : person.masuk, pulang: person.pulang?.id === record.id ? record : person.pulang })),
  }));

  /** "Hapus absen": the slot is empty again (and can be recorded by hand). */
  const removed = (record: DailyRecord) => setDay(value => ({
    ...value,
    people: value.people.map(person => ({ ...person, masuk: person.masuk?.id === record.id ? null : person.masuk, pulang: person.pulang?.id === record.id ? null : person.pulang })),
  }));

  async function manual(person: DayPerson, kind: DailyKind) {
    setBusy(true); setMessage(null);
    try {
      const result = await adminRequest<DailyRecord>(hrAdminApi.manual, { method: "POST", body: JSON.stringify({ employeeId: person.employeeId, workDate: day.date, kind, time: manualTime, zone: "WIB", note }) });
      setDay(value => ({ ...value, people: value.people.map(item => item.employeeId === person.employeeId ? { ...item, [kind]: result.data ?? null } : item) }));
      setNote(""); setOpen(null); setMessage({ tone: "success", text: `${result.message} (${person.name})` });
    } catch (error) { setMessage({ tone: "error", text: errorMessage(error) }); }
    finally { setBusy(false); }
  }

  async function deleteOld() {
    if (!window.confirm("Hapus semua selfie absen yang lebih dari 90 hari? Jam, lokasi, dan status absennya tetap tersimpan. Selfie yang terhapus tidak bisa dikembalikan.")) return;
    setBusy(true); setMessage(null);
    try { const result = await adminRequest<{ deleted: number }>(hrAdminApi.oldSelfies, { method: "POST", body: "{}" }); setMessage({ tone: "success", text: result.message }); }
    catch (error) { setMessage({ tone: "error", text: errorMessage(error) }); }
    finally { setBusy(false); }
  }

  const slot = (person: DayPerson, kind: DailyKind) => {
    const record = person[kind];
    const isOpen = open?.employeeId === person.employeeId && open.kind === kind;
    return <button type="button" className={css.slot} aria-expanded={isOpen} onClick={() => { setNote(""); setOpen(isOpen ? null : { employeeId: person.employeeId, kind }); }}>
      <span className={css.slotLabel}>{kindLabels[kind]}</span>
      {record ? <>
        <span className={css.slotTime}>{time(record.at)}</span>
        <span className={css.muted}>{where(record)}</span>
        <Pill tone={statusTone[record.status]}>{statusLabels[record.status]}</Pill>
      </> : <span className={css.muted}>Belum · ketuk untuk catat manual</span>}
    </button>;
  };

  const detail = (person: DayPerson, kind: DailyKind) => {
    const record = person[kind];
    if (record) return <RecordReview record={record} employeeId={person.employeeId} name={person.name} hasFace={!!person.face} onChanged={replace} onDeleted={removed} onMessage={setMessage} />;
    return <div className={css.review}>
      <p className={css.muted}>Belum ada absen {kindLabels[kind].toLowerCase()} {person.name}. Catat manual bila orangnya hadir (HP rusak, belum setuju data wajah, lupa absen).</p>
      <div className={css.actions}>
        <label className={css.field}>Jam (WIB)<input type="time" value={manualTime} onChange={event => setManualTime(event.target.value)} /></label>
        <label className={`${css.field} ${css.grow}`}>Alasan<input type="text" maxLength={300} value={note} onChange={event => setNote(event.target.value)} placeholder="Mis. HP rusak" /></label>
        <ConsoleButton variant="primary" disabled={busy || note.trim().length < 3} onClick={() => void manual(person, kind)}>Catat {kindLabels[kind].toLowerCase()}</ConsoleButton>
      </div>
    </div>;
  };

  return <>
    <PageHeader title="Absen harian" subtitle="Masuk dan pulang semua karyawan per hari. Ketuk satu kotak untuk melihat detail, menyetujui, atau mencatat manual."
      actions={<ConsoleButton icon={<Trash2 size={16} aria-hidden />} disabled={busy} onClick={() => void deleteOld()}>Hapus selfie lama</ConsoleButton>} />
    {message && <Notice tone={message.tone}>{message.text}</Notice>}
    {day.offices.length === 0 && <Notice tone="warning">Belum ada titik kantor, jadi semua absen terhitung di luar area. <a href={hrAdminPath.offices}>Atur titik kantor</a>.</Notice>}
    <Card title={longDay(day.date)}>
      <div className={css.toolbar}>
        <div className={css.dayPicker}>
          <button type="button" className={css.iconButton} aria-label="Hari sebelumnya" disabled={busy} onClick={() => void loadDay(shift(day.date, -1))}><ChevronLeft size={18} /></button>
          <label>Tanggal<input type="date" value={day.date} onChange={event => event.target.value && void loadDay(event.target.value)} /></label>
          <button type="button" className={css.iconButton} aria-label="Hari berikutnya" disabled={busy || day.date >= today} onClick={() => void loadDay(shift(day.date, 1))}><ChevronRight size={18} /></button>
          {day.date !== today && <ConsoleButton disabled={busy} onClick={() => void loadDay(today)}>Hari ini</ConsoleButton>}
        </div>
        <SearchField label="Cari karyawan" placeholder="Cari nama atau departemen" value={query} onChange={setQuery} />
      </div>
      <div className={css.toolbar}>
        <FilterChips label="Saring" value={filter} onChange={setFilter} chips={[
          { value: "semua", label: "Semua", count: counts.semua },
          { value: "belum", label: "Belum absen", count: counts.belum },
          { value: "perlu", label: "Perlu dicek", count: counts.perlu },
          { value: "luar", label: "Di luar kantor", count: counts.luar },
        ]} />
        {counts.perlu > 0 && <ConsoleButtonLink href={hrAdminPath.waiting}>Buka antrean Perlu dicek</ConsoleButtonLink>}
      </div>
      {shown.length === 0 ? <p className={css.muted}>Tidak ada yang cocok dengan saringan ini.</p> : <ul className={css.rows}>
        {shown.map(person => <li key={person.employeeId} className={css.row}>
          <div className={css.rowHead}>
            <span className={css.who}><strong>{person.name}</strong><span className={css.muted}>{person.department || "Tanpa departemen"}</span></span>
            {!person.face && <Pill tone="neutral">Belum ada data wajah</Pill>}
          </div>
          <div className={css.slots}>{slot(person, "masuk")}{slot(person, "pulang")}</div>
          {open?.employeeId === person.employeeId && detail(person, open.kind)}
        </li>)}
      </ul>}
    </Card>
  </>;
}
