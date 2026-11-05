"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, CheckCircle2, Circle, CircleDashed, Users } from "lucide-react";
import { ConsoleButton, FilterChips, Pill, SectionToolbar, StatCard, StatRow, type ConsoleTone } from "@/components/console";
import { Notice } from "@/components/ui";
import { useConfirm } from "@/components/pra-wam/ConfirmDialog";
import { adminRequest, errorMessage } from "@/components/admin/shared/api";
import { praWamQuestionnaireApi } from "@/lib/routes";
import type { ProgressReport, ProgressState } from "@/lib/server/pra-wam/questionnaire-admin";
import cs from "@/components/console/console.module.css";
import styles from "./questionnaire.module.css";

const stateLabels: Record<ProgressState, string> = { belum: "Belum mulai", sedang: "Sedang mengisi", selesai: "Selesai" };
const stateTone: Record<ProgressState, ConsoleTone> = { belum: "warn", sedang: "blue", selesai: "ok" };
const StateIcon = ({ state }: { state: ProgressState }) => state === "selesai" ? <CheckCircle2 size={14} aria-hidden /> : state === "sedang" ? <CircleDashed size={14} aria-hidden /> : <Circle size={14} aria-hidden />;
const when = (iso: string) => new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(new Date(iso));
const percent = (part: number, total: number) => total ? Math.round((part / total) * 100) : 0;

/**
 * Admin WAM → Kuesioner → Progres: how many have not started, are filling in, or are done; the
 * same per department as a table with a bar; everyone with their status and last activity,
 * filtered by status, department or name; and "Ingatkan" for the group picked. No answers are shown here.
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

  const unitStatus = (counts: Record<ProgressState, number>, all: number): { tone: ConsoleTone; label: string } =>
    all && counts.selesai === all ? { tone: "ok", label: "Selesai" } : counts.selesai || counts.sedang ? { tone: "blue", label: "Berjalan" } : { tone: "warn", label: "Belum mulai" };

  return <div className="stack">
    <StatRow label="Ringkasan progres">
      <StatCard label="Sudah selesai" tone="ok" icon={<CheckCircle2 size={18} />} value={report.counts.selesai} note={`${percent(report.counts.selesai, total)}% dari ${total} karyawan`} />
      <StatCard label={stateLabels.sedang} tone="blue" icon={<CircleDashed size={18} />} value={report.counts.sedang} note={`${percent(report.counts.sedang, total)}%`} />
      <StatCard label={stateLabels.belum} tone="warn" icon={<Circle size={18} />} value={report.counts.belum} note={`${percent(report.counts.belum, total)}%`} />
      <StatCard label="Karyawan aktif" icon={<Users size={18} />} value={total} note={`${report.sectionsTotal} bagian per orang`} />
    </StatRow>

    <div className={styles.remind}>
      <p id="qp-remind-note" className={styles.muted}>
        {!reminder.open ? "Pengingat hanya bisa dikirim selama kuesioner dibuka dan belum lewat tenggat." : "Lewat notifikasi WAM. Pilih \"Belum mulai\" atau \"Sedang mengisi\" di daftar orang untuk mengingatkan kelompok itu saja."}
        {reminder.last && ` Terakhir dikirim ${when(reminder.last.at)} ke ${reminder.last.recipients} orang.`}
      </p>
      <ConsoleButton variant="primary" disabled={!reminder.open || !remindCount || sending} aria-describedby="qp-remind-note" onClick={() => void remind()} icon={<Bell size={18} aria-hidden="true" />}>
        {sending ? "Mengirim…" : `Ingatkan ${whoLabel} (${remindCount})`}
      </ConsoleButton>
    </div>
    {sent && <Notice tone={sent.tone}>{sent.text}</Notice>}
    {confirmDialog}

    <section className="stack" aria-labelledby="qp-dept">
      <SectionToolbar title={<span id="qp-dept">Progres per unit</span>} count={`${report.departments.length} unit`} />
      {report.departments.length
        ? <div className={cs.tableWrap}><table className={cs.table}>
          <thead><tr><th scope="col">Unit</th><th scope="col">Progres</th><th scope="col">Sedang mengisi</th><th scope="col">Belum mulai</th><th scope="col">Status</th></tr></thead>
          <tbody>{report.departments.map(item => {
            const status = unitStatus(item.counts, item.total);
            return <tr key={item.name}>
              <td className={styles.rowName}>{item.name}</td>
              <td><span className={styles.progress}>
                <span className={styles.progressTrack} role="img" aria-label={`${item.counts.selesai} dari ${item.total} selesai, ${item.counts.sedang} sedang mengisi`}>
                  <span className={styles.progressDone} style={{ width: `${percent(item.counts.selesai, item.total)}%` }} />
                  <span className={styles.progressDoing} style={{ width: `${percent(item.counts.sedang, item.total)}%` }} />
                </span>
                <span className={styles.progressText}>{item.counts.selesai}/{item.total} · {percent(item.counts.selesai, item.total)}%</span>
              </span></td>
              <td>{item.counts.sedang}</td>
              <td>{item.counts.belum}</td>
              <td><Pill tone={status.tone}>{status.label}</Pill></td>
            </tr>;
          })}</tbody>
        </table></div>
        : <p className={styles.muted}>Belum ada karyawan aktif di Data karyawan.</p>}
    </section>

    <section className="stack" aria-labelledby="qp-people">
      <SectionToolbar title={<span id="qp-people">Daftar orang</span>} count={shown.length === total ? `${total} orang` : `${shown.length} dari ${total}`}
        search={{ label: "Cari nama", placeholder: "Cari nama", value: query, onChange: setQuery, id: "qp-search" }}>
        <label className={styles.inlineSelect}>
          <span className="sr-only">Departemen</span>
          <select id="qp-department" className="select" value={department} onChange={event => setDepartment(event.target.value)}>
            <option value="">Semua departemen</option>
            {report.departments.map(item => <option key={item.name} value={item.name}>{item.name}</option>)}
          </select>
        </label>
      </SectionToolbar>
      <FilterChips label="Status" value={state || "semua"} onChange={value => setState(value === "semua" ? "" : value)} chips={[
        { value: "semua", label: "Semua", count: total },
        ...(["belum", "sedang", "selesai"] as const).map(key => ({ value: key, label: stateLabels[key], count: report.counts[key] })),
      ]} />
      <p className="sr-only" aria-live="polite">{shown.length === total ? `Menampilkan semua ${total} orang.` : `Menampilkan ${shown.length} dari ${total} orang.`}</p>
      {shown.length
        ? <div className={cs.tableWrap}><table className={cs.table}>
          <thead><tr><th scope="col">Nama</th><th scope="col">Unit</th><th scope="col">Bagian</th><th scope="col">Terakhir aktif</th><th scope="col">Status</th></tr></thead>
          <tbody>{shown.map(person => <tr key={person.employeeId}>
            <td className={styles.rowName}>{person.name}</td>
            <td>{person.department}</td>
            <td>{person.sectionsDone}/{person.sectionsTotal}</td>
            <td className={cs.tableMuted}>{person.lastActivity ? `${when(person.lastActivity)} WIB` : "Belum ada aktivitas"}</td>
            <td><Pill tone={stateTone[person.state]}><span className={styles.pillIcon}><StateIcon state={person.state} />{stateLabels[person.state]}</span></Pill></td>
          </tr>)}</tbody>
        </table></div>
        : <p className={styles.muted}>Tidak ada yang cocok dengan filter ini.</p>}
    </section>
  </div>;
}
