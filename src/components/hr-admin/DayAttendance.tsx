"use client";

import { Fragment, useCallback, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import { Notice } from "@/components/ui";
import { Card, ConsoleButton, ConsoleButtonLink, FilterChips, PageHeader, Pill, SearchField, useViewPreference, ViewToggle, type ConsoleTone } from "@/components/console";
import { adminRequest, errorMessage } from "@/components/admin/shared/api";
import { kindLabels, reasonLabels, statusLabels, type DailyKind, type DailyRecord, type DailyStatus } from "@/lib/hr/attendance";
import type { DayTable } from "@/lib/hr/recap";
import { CellLegend, StatusCell } from "./cells";
import { hrAdminApi, hrAdminPath } from "@/lib/routes";
import { RecordReview } from "./RecordReview";
import { Flash } from "./Flash";
import css from "./hr-admin.module.css";

type Message = { tone: "success" | "error"; text: string } | null;
type Filter = "semua" | "belum" | "telat" | "cuti" | "perlu" | "luar";
type DayPerson = DayTable["people"][number];
type Open = { employeeId: string; kind: DailyKind } | null;

const time = (iso: string) => new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(new Date(iso));
const longDay = (date: string) => new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
const shift = (date: string, days: number) => new Date(Date.parse(`${date}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
const statusTone: Record<DailyStatus, ConsoleTone> = { sah: "ok", perlu_cek: "warn", ditolak: "bad" };
const waits = (person: DayPerson) => [person.masuk, person.pulang].some(record => record?.status === "perlu_cek");
const outside = (person: DayPerson) => [person.masuk, person.pulang].some(record => record?.method === "wajah" && !!record.reasonKind);
const late = (person: DayPerson) => person.cell.kind === "telat";
const away = (person: DayPerson) => ["cuti", "sakit", "izin", "dinas"].includes(person.cell.kind) && !person.masuk;
const missing = (person: DayPerson) => !person.masuk && !away(person);
const where = (record: DailyRecord) => record.method === "manual" ? "Dicatat manual" : record.reasonKind ? `${reasonLabels[record.reasonKind]}${record.reasonText ? ` · ${record.reasonText}` : ""}` : record.officeName ?? "—";

/**
 * Admin HR → Absen harian (20 Nov 2026): everyone who should clock in, their masuk and pulang on one
 * day. Move a day with ‹ ›, find a name, filter (belum absen, telat, cuti/izin, perlu dicek, di luar
 * kantor); open a slot to look at the clock-in and decide it, or to record a missing one by hand.
 * Two views (21 Nov 2026, the owner's ask): Tabel, one coloured row per person like a spreadsheet
 * (status, masuk, pulang, place), and Kartu, as before. The choice is remembered on this device.
 */
export function DayAttendance({ initial, today }: { initial: DayTable; today: string }) {
  const [day, setDay] = useState(initial);
  const [filter, setFilter] = useState<Filter>("semua");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Open>(null);
  const [note, setNote] = useState("");
  const [manualTime, setManualTime] = useState("08:00");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  const clearMessage = useCallback(() => setMessage(null), []);
  const [view, setView] = useViewPreference("admin-hr-absen", "tabel");
  /** The day asked for last: an answer for another day (a slow quiet reload) is dropped. */
  const wanted = useRef(initial.date);

  const counts = useMemo(() => ({
    semua: day.people.length,
    belum: day.people.filter(missing).length,
    telat: day.people.filter(late).length,
    cuti: day.people.filter(away).length,
    perlu: day.people.filter(waits).length,
    luar: day.people.filter(outside).length,
  }), [day.people]);
  const needle = query.trim().toLowerCase();
  const shown = day.people
    .filter(person => filter === "semua" || { belum: missing, telat: late, cuti: away, perlu: waits, luar: outside }[filter](person))
    .filter(person => !needle || `${person.name} ${person.department}`.toLowerCase().includes(needle));

  async function loadDay(date: string, quiet = false) {
    if (!quiet) { setBusy(true); setMessage(null); wanted.current = date; }
    try {
      const result = await adminRequest<DayTable>(hrAdminApi.day(date));
      if (result.data && date === wanted.current) { setDay(result.data); if (!quiet) setOpen(null); window.history.replaceState(null, "", hrAdminPath.day(date)); }
    } catch (error) { setMessage({ tone: "error", text: errorMessage(error) }); }
    finally { if (!quiet) setBusy(false); }
  }
  // After a change the cells are read again (Telat, Hadir, … come from the server), quietly.
  const replace = (record: DailyRecord) => { setDay(value => ({
    ...value,
    people: value.people.map(person => ({ ...person, masuk: person.masuk?.id === record.id ? record : person.masuk, pulang: person.pulang?.id === record.id ? record : person.pulang })),
  })); void loadDay(day.date, true); };

  /** "Hapus absen": the slot is empty again (and can be recorded by hand). */
  const removed = (record: DailyRecord) => { setDay(value => ({
    ...value,
    people: value.people.map(person => ({ ...person, masuk: person.masuk?.id === record.id ? null : person.masuk, pulang: person.pulang?.id === record.id ? null : person.pulang })),
  })); void loadDay(day.date, true); };

  async function manual(person: DayPerson, kind: DailyKind) {
    setBusy(true); setMessage(null);
    try {
      const result = await adminRequest<DailyRecord>(hrAdminApi.manual, { method: "POST", body: JSON.stringify({ employeeId: person.employeeId, workDate: day.date, kind, time: manualTime, zone: "WIB", note }) });
      setDay(value => ({ ...value, people: value.people.map(item => item.employeeId === person.employeeId ? { ...item, [kind]: result.data ?? null } : item) }));
      setNote(""); setOpen(null); setMessage({ tone: "success", text: `${result.message} (${person.name})` });
      void loadDay(day.date, true);
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
    <PageHeader title="Absen harian" subtitle={`Masuk dan pulang semua karyawan per hari. Telat = masuk setelah ${day.lateAfter.replace(":", ".")}. Buka satu orang untuk melihat detail, menyetujui, atau mencatat manual.`}
      actions={<ConsoleButton icon={<Trash2 size={16} aria-hidden />} disabled={busy} onClick={() => void deleteOld()}>Hapus selfie lama</ConsoleButton>} />
    <Flash message={message} onClose={clearMessage} />
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
        <ViewToggle value={view} onChange={setView} />
      </div>
      <div className={css.toolbar}>
        <FilterChips label="Saring" value={filter} onChange={setFilter} chips={[
          { value: "semua", label: "Semua", count: counts.semua },
          { value: "belum", label: "Belum absen", count: counts.belum },
          { value: "telat", label: "Telat", count: counts.telat },
          { value: "cuti", label: "Cuti, sakit, izin, dinas", count: counts.cuti },
          { value: "perlu", label: "Perlu dicek", count: counts.perlu },
          { value: "luar", label: "Di luar kantor", count: counts.luar },
        ]} />
        {counts.perlu > 0 && <ConsoleButtonLink href={hrAdminPath.waiting}>Buka antrean Perlu dicek</ConsoleButtonLink>}
      </div>
      {view === "tabel" && <CellLegend />}
      {shown.length === 0 ? <p className={css.muted}>Tidak ada yang cocok dengan saringan ini.</p>
        : view === "tabel" ? <div className={css.tableWrap}><table className={css.sheet}>
          <caption className="sr-only">Absen {longDay(day.date)}</caption>
          <thead><tr><th scope="col">Nama</th><th scope="col">Status</th><th scope="col">Masuk</th><th scope="col">Pulang</th><th scope="col">Lokasi</th><th scope="col">Cek</th></tr></thead>
          <tbody>{shown.map(person => {
            const opened = open?.employeeId === person.employeeId;
            const first = person.masuk ?? person.pulang;
            const pick = (kind: DailyKind) => { setNote(""); setOpen(opened && open?.kind === kind ? null : { employeeId: person.employeeId, kind }); };
            return <Fragment key={person.employeeId}>
              <tr className={opened ? css.rowOpen : undefined}>
                <th scope="row" className={css.name}><strong>{person.name}</strong><span className={css.muted}>{person.department || "Tanpa departemen"}{person.face ? "" : " · belum ada data wajah"}</span></th>
                <td><StatusCell cell={person.cell} /></td>
                {(["masuk", "pulang"] as const).map(kind => <td key={kind}>
                  <button type="button" className={css.openButton} aria-expanded={opened && open?.kind === kind} onClick={() => pick(kind)}>
                    {person[kind] ? <span className={css.num}>{person.cell[kind] ?? time(person[kind]!.at)}</span> : <span className={css.muted}>Catat</span>}
                    <span className="sr-only"> {kindLabels[kind].toLowerCase()} {person.name}</span>
                  </button>
                </td>)}
                <td>{first ? where(first) : <span className={css.muted}>—</span>}</td>
                <td>{waits(person) ? <Pill tone="warn">Perlu dicek</Pill> : [person.masuk, person.pulang].some(record => record?.status === "ditolak") ? <Pill tone="bad">Ditolak</Pill> : <span className={css.muted}>—</span>}</td>
              </tr>
              {opened && open && <tr className={css.detailRow}><td colSpan={6}>{detail(person, open.kind)}</td></tr>}
            </Fragment>;
          })}</tbody>
        </table></div>
          : <ul className={css.rows}>
        {shown.map(person => <li key={person.employeeId} className={css.row}>
          <div className={css.rowHead}>
            <span className={css.who}><strong>{person.name}</strong><span className={css.muted}>{person.department || "Tanpa departemen"}</span></span>
            <span className={css.pills}><StatusCell cell={person.cell} />{!person.face && <Pill tone="neutral">Belum ada data wajah</Pill>}</span>
          </div>
          <div className={css.slots}>{slot(person, "masuk")}{slot(person, "pulang")}</div>
          {open?.employeeId === person.employeeId && detail(person, open.kind)}
        </li>)}
      </ul>}
    </Card>
  </>;
}
