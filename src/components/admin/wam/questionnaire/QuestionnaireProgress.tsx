"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, CheckCircle2, Circle, CircleDashed, Search } from "lucide-react";
import { Button, Field, Notice } from "@/components/ui";
import { useConfirm } from "@/components/pra-wam/ConfirmDialog";
import { adminRequest, errorMessage } from "@/components/admin/shared/api";
import { praWamQuestionnaireApi } from "@/lib/routes";
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
export type ReminderState = { open: boolean; last: { at: string; recipients: number } | null };

export function QuestionnaireProgress({ report, reminder = { open: false, last: null } }: { report: ProgressReport; reminder?: ReminderState }) {
  const router = useRouter();
  const [confirm, confirmDialog] = useConfirm();
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [state, setState] = useState<ProgressState | "">("");
  const [department, setDepartment] = useState("");
  const [query, setQuery] = useState("");
  const total = report.people.length;
  const search = query.trim().toLowerCase();
  const remindWho = state === "belum" || state === "sedang" ? state : "semua";
  const whoLabel = remindWho === "belum" ? "yang belum mulai" : remindWho === "sedang" ? "yang sedang mengisi" : "yang belum selesai";
  const remindCount = report.people.filter(person => person.state !== "selesai" && (remindWho === "semua" || person.state === remindWho)).length;
  const remind = async () => {
    if (!(await confirm({ title: `Ingatkan ${whoLabel}?`, body: `${remindCount} orang mendapat notifikasi WAM untuk menyelesaikan ${report.formName}.`, confirmLabel: "Kirim pengingat" }))) return;
    setSending(true); setSent(null);
    try {
      const result = await adminRequest(praWamQuestionnaireApi.remind, { method: "POST", body: JSON.stringify({ who: remindWho }) });
      setSent({ tone: "success", text: result.message });
      router.refresh();
    } catch (error) { setSent({ tone: "error", text: errorMessage(error) }); }
    finally { setSending(false); }
  };
  const shown = report.people.filter(person => (!state || person.state === state) && (!department || person.department === department) && (!search || person.name.toLowerCase().includes(search)));

  return <div className="stack">
    <div className={styles.head}>
      <div>
        <h2>Progres</h2>
        <p className={styles.muted}>{total} karyawan aktif · {report.sectionsTotal} bagian. Hanya status, tanpa isi jawaban.</p>
      </div>
      <Button type="button" variant="secondary" disabled={!reminder.open || !remindCount || sending} aria-describedby="qp-remind-note" onClick={() => void remind()}>
        <Bell size={18} aria-hidden /> {sending ? "Mengirim…" : `Ingatkan ${whoLabel} (${remindCount})`}
      </Button>
    </div>
    <p id="qp-remind-note" className={styles.muted}>
      {!reminder.open ? "Pengingat hanya bisa dikirim selama kuesioner dibuka dan belum lewat tenggat." : "Lewat notifikasi WAM. Pilih \"Belum mulai\" atau \"Sedang mengisi\" di bawah untuk mengingatkan kelompok itu saja."}
      {reminder.last && ` Terakhir dikirim ${when(reminder.last.at)} ke ${reminder.last.recipients} orang.`}
    </p>
    {sent && <Notice tone={sent.tone}>{sent.text}</Notice>}
    {confirmDialog}

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
