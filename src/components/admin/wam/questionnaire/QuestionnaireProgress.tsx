"use client";

import { useState } from "react";
import { Bell, CheckCircle2, Circle, CircleDashed, Search } from "lucide-react";
import { Button, Field } from "@/components/ui";
import type { ProgressReport, ProgressState } from "@/lib/server/pra-wam/questionnaire-admin";
import styles from "./questionnaire.module.css";

const stateLabels: Record<ProgressState, string> = { belum: "Belum mulai", sedang: "Sedang mengisi", selesai: "Selesai" };
const stateClass: Record<ProgressState, string> = { belum: styles.stateBelum, sedang: styles.stateSedang, selesai: styles.stateSelesai };
const StateIcon = ({ state }: { state: ProgressState }) => state === "selesai" ? <CheckCircle2 size={14} aria-hidden /> : state === "sedang" ? <CircleDashed size={14} aria-hidden /> : <Circle size={14} aria-hidden />;
const when = (iso: string) => new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(new Date(iso));
const percent = (part: number, total: number) => total ? Math.round((part / total) * 100) : 0;

/**
 * Admin WAM → Kuesioner → Progres: how many have not started, are filling in, or are done; the
 * same per department; and everyone with their status and last activity, filtered by status,
 * department or name. No answers are shown here. Reminders come in stage 4.
 */
export function QuestionnaireProgress({ report }: { report: ProgressReport }) {
  const [state, setState] = useState<ProgressState | "">("");
  const [department, setDepartment] = useState("");
  const [query, setQuery] = useState("");
  const total = report.people.length;
  const search = query.trim().toLowerCase();
  const shown = report.people.filter(person => (!state || person.state === state) && (!department || person.department === department) && (!search || person.name.toLowerCase().includes(search)));

  return <div className="stack">
    <div className={styles.head}>
      <div>
        <h2>Progres</h2>
        <p className={styles.muted}>{total} karyawan aktif · {report.sectionsTotal} bagian. Hanya status, tanpa isi jawaban.</p>
      </div>
      <Button type="button" variant="secondary" disabled aria-describedby="qp-remind-note"><Bell size={18} aria-hidden /> Ingatkan yang belum (segera)</Button>
    </div>
    <p id="qp-remind-note" className="sr-only">Pengingat lewat notifikasi WAM menyusul di tahap berikutnya.</p>

    <ul className={styles.stats} aria-label="Ringkasan progres">
      {(["belum", "sedang", "selesai"] as const).map(key => <li key={key}>
        <button type="button" className={styles.stat} aria-pressed={state === key} onClick={() => setState(state === key ? "" : key)}>
          <strong>{report.counts[key]}</strong>
          <span>{stateLabels[key]} · {percent(report.counts[key], total)}%</span>
        </button>
      </li>)}
    </ul>
    <div className={styles.bar} role="img" aria-label={`${report.counts.selesai} selesai, ${report.counts.sedang} sedang mengisi, ${report.counts.belum} belum mulai`}>
      <span className={styles.barDone} style={{ width: `${percent(report.counts.selesai, total)}%` }} />
      <span className={styles.barDoing} style={{ width: `${percent(report.counts.sedang, total)}%` }} />
    </div>

    <section className={styles.card} aria-labelledby="qp-dept">
      <h3 id="qp-dept">Per departemen</h3>
      {report.departments.length
        ? <ul className={styles.departments}>{report.departments.map(item => <li key={item.name} className={styles.department}>
          <strong>{item.name}</strong>
          <div className={styles.bar} role="img" aria-label={`${item.counts.selesai} dari ${item.total} selesai, ${item.counts.sedang} sedang mengisi`}>
            <span className={styles.barDone} style={{ width: `${percent(item.counts.selesai, item.total)}%` }} />
            <span className={styles.barDoing} style={{ width: `${percent(item.counts.sedang, item.total)}%` }} />
          </div>
          <span className={styles.muted}>{item.counts.selesai}/{item.total} selesai{item.counts.sedang ? ` · ${item.counts.sedang} sedang` : ""}</span>
        </li>)}</ul>
        : <p className={styles.muted}>Belum ada karyawan aktif di Data karyawan.</p>}
    </section>

    <section className="stack" aria-labelledby="qp-people">
      <h3 id="qp-people">Daftar orang</h3>
      <div className={styles.filters}>
        <Field label="Cari nama" name="qp-search">
          <span className={styles.previewSearch}>
            <Search size={18} aria-hidden />
            <input id="qp-search" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Ketik nama" />
          </span>
        </Field>
        <Field label="Status" name="qp-state">
          <select id="qp-state" className="select" value={state} onChange={event => setState(event.target.value as ProgressState | "")}>
            <option value="">Semua status</option>
            {(["belum", "sedang", "selesai"] as const).map(key => <option key={key} value={key}>{stateLabels[key]}</option>)}
          </select>
        </Field>
        <Field label="Departemen" name="qp-department">
          <select id="qp-department" className="select" value={department} onChange={event => setDepartment(event.target.value)}>
            <option value="">Semua departemen</option>
            {report.departments.map(item => <option key={item.name} value={item.name}>{item.name}</option>)}
          </select>
        </Field>
      </div>
      <p className={styles.muted} aria-live="polite">{shown.length === total ? `Menampilkan semua ${total} orang.` : `Menampilkan ${shown.length} dari ${total} orang.`}</p>
      {shown.length
        ? <ul className={styles.people}>{shown.map(person => <li key={person.employeeId} className={styles.person}>
          <div>
            <strong>{person.name}</strong>
            <span>{person.department} · {person.sectionsDone}/{person.sectionsTotal} bagian · {person.lastActivity ? `terakhir ${when(person.lastActivity)} WIB` : "belum ada aktivitas"}</span>
          </div>
          <span className={`${styles.state} ${stateClass[person.state]}`}><StateIcon state={person.state} />{stateLabels[person.state]}</span>
        </li>)}</ul>
        : <p className={styles.muted}>Tidak ada yang cocok dengan filter ini.</p>}
    </section>
  </div>;
}
