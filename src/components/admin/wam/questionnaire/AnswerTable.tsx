"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, CheckCircle2, Circle, CircleDashed, Download, Users } from "lucide-react";
import { ConsoleButton, ConsoleButtonLink, FilterChips, Pill, SearchField, StatCard, StatRow, type ConsoleTone } from "@/components/console";
import { Notice } from "@/components/ui";
import { useConfirm } from "@/components/pra-wam/ConfirmDialog";
import { adminRequest, errorMessage } from "@/components/admin/shared/api";
import type { Visibility } from "@/lib/pra-wam/questionnaire";
import { praWamQuestionnaireApi } from "@/lib/routes";
import type { AnswerTable as Table } from "@/lib/server/pra-wam/answer-table";
import type { ProgressState } from "@/lib/server/pra-wam/questionnaire-admin";
import css from "./answer-table.module.css";

export type ReminderState = { open: boolean; last: { at: string; recipients: number } | null };

const stateLabels: Record<ProgressState, string> = { belum: "Belum mulai", sedang: "Sedang mengisi", selesai: "Selesai" };
const stateTone: Record<ProgressState, ConsoleTone> = { belum: "warn", sedang: "blue", selesai: "ok" };
/** Who the participant was told reads it, short, under the column's question. */
const readBy: Partial<Record<Visibility, { label: string; tone: ConsoleTone }>> = {
  rekan: { label: "Rekan", tone: "teal" }, fasil: { label: "Panitia", tone: "blue" }, hr: { label: "HR", tone: "brass" },
  hronly: { label: "Rahasia", tone: "bad" }, pilih: { label: "Pilihan peserta", tone: "purple" },
};
const percent = (part: number, total: number) => total ? Math.round((part / total) * 100) : 0;
const when = (iso: string) => new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(new Date(iso));

type StateFilter = ProgressState | "semua";

/**
 * Admin WAM → Kuesioner → Rekap (11 Nov 2026): everything on one page. The counts, "Ingatkan", then
 * one table with a row per person (name, department, status) and a column per question with the
 * answer, HR and Rahasia included; filtered by name, department, status and section, and the same
 * table as Excel. The name stays in view while the answers scroll sideways.
 */
export function AnswerTable({ table, reminder }: { table: Table; reminder: ReminderState }) {
  const router = useRouter();
  const [confirm, confirmDialog] = useConfirm();
  const [query, setQuery] = useState("");
  const [department, setDepartment] = useState("");
  const [state, setState] = useState<StateFilter>("semua");
  const [section, setSection] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const total = table.rows.length;
  const departments = useMemo(() => [...new Set(table.rows.map(row => row.department).filter(Boolean))].sort((a, b) => a.localeCompare(b, "id")), [table.rows]);
  const columns = section ? table.columns.filter(column => column.sectionId === section) : table.columns;
  const rows = useMemo(() => {
    const words = query.trim().toLocaleLowerCase("id").split(/\s+/).filter(Boolean);
    return table.rows.filter(row => (state === "semua" || row.state === state) && (!department || row.department === department)
      && words.every(word => `${row.name} ${row.department}`.toLocaleLowerCase("id").includes(word)));
  }, [table.rows, query, state, department]);

  const remindWho = state === "belum" || state === "sedang" ? state : "semua";
  const whoLabel = remindWho === "belum" ? "yang belum mulai" : remindWho === "sedang" ? "yang sedang mengisi" : "yang belum selesai";
  const remindCount = table.rows.filter(row => row.state !== "selesai" && (remindWho === "semua" || row.state === remindWho)).length;
  async function remind() {
    if (!(await confirm({ title: `Ingatkan ${whoLabel}?`, body: `${remindCount} orang mendapat notifikasi WAM untuk menyelesaikan ${table.formName}.`, confirmLabel: "Kirim pengingat" }))) return;
    setSending(true); setSent(null);
    try {
      const result = await adminRequest(praWamQuestionnaireApi.remind, { method: "POST", body: JSON.stringify({ who: remindWho }) });
      setSent({ tone: "success", text: result.message });
      router.refresh();
    } catch (problem) { setSent({ tone: "error", text: errorMessage(problem) }); }
    finally { setSending(false); }
  }

  return <div className="stack">
    {confirmDialog}
    <StatRow label="Ringkasan">
      <StatCard label="Sudah selesai" tone="ok" icon={<CheckCircle2 size={18} />} value={table.counts.selesai} note={`${percent(table.counts.selesai, total)}% dari ${total} orang`} />
      <StatCard label={stateLabels.sedang} tone="blue" icon={<CircleDashed size={18} />} value={table.counts.sedang} note={`${percent(table.counts.sedang, total)}%`} />
      <StatCard label={stateLabels.belum} tone="warn" icon={<Circle size={18} />} value={table.counts.belum} note={`${percent(table.counts.belum, total)}%`} />
      <StatCard label="Peserta" icon={<Users size={18} />} value={total} note={`${table.columns.length} pertanyaan bernama`} />
    </StatRow>

    <div className={css.remind}>
      <p id="at-remind-note">
        {!reminder.open ? "Pengingat hanya bisa dikirim selama kuesioner dibuka dan belum lewat tenggat." : "Lewat notifikasi WAM. Pilih status Belum mulai atau Sedang mengisi di bawah untuk mengingatkan kelompok itu saja."}
        {reminder.last && ` Terakhir dikirim ${when(reminder.last.at)} ke ${reminder.last.recipients} orang.`}
      </p>
      <ConsoleButton variant="primary" disabled={!reminder.open || !remindCount || sending} aria-describedby="at-remind-note" onClick={() => void remind()} icon={<Bell size={18} aria-hidden="true" />}>
        {sending ? "Mengirim…" : `Ingatkan ${whoLabel} (${remindCount})`}
      </ConsoleButton>
    </div>
    {sent && <Notice tone={sent.tone}>{sent.text}</Notice>}

    <div className={css.tools}>
      <SearchField label="Cari nama atau departemen" placeholder="Cari nama atau departemen" value={query} onChange={setQuery} />
      <label className={css.select}><span className="sr-only">Departemen</span>
        <select className="input" value={department} onChange={event => setDepartment(event.target.value)}>
          <option value="">Semua departemen</option>
          {departments.map(name => <option key={name} value={name}>{name}</option>)}
        </select>
      </label>
      <label className={css.select}><span className="sr-only">Bagian</span>
        <select className="input" value={section} onChange={event => setSection(event.target.value)}>
          <option value="">Semua bagian ({table.columns.length} pertanyaan)</option>
          {table.sections.map(item => <option key={item.id} value={item.id}>{item.title} ({table.columns.filter(column => column.sectionId === item.id).length})</option>)}
        </select>
      </label>
      <ConsoleButtonLink href={praWamQuestionnaireApi.table} download icon={<Download size={18} aria-hidden="true" />}>Unduh Excel</ConsoleButtonLink>
    </div>
    <FilterChips<StateFilter> label="Status" value={state} onChange={setState} chips={[
      { value: "semua", label: "Semua", count: total },
      { value: "selesai", label: stateLabels.selesai, count: table.counts.selesai },
      { value: "sedang", label: stateLabels.sedang, count: table.counts.sedang },
      { value: "belum", label: stateLabels.belum, count: table.counts.belum },
    ]} />

    <p className={css.count} aria-live="polite">{rows.length} dari {total} orang · {columns.length} pertanyaan. Geser tabel ke samping untuk melihat semua jawaban.</p>
    {rows.length ? <div className={css.scroller} role="region" aria-label="Tabel jawaban" tabIndex={0}>
      <table className={css.table}>
        <thead>
          <tr>
            <th scope="col" className={css.who}>Nama</th>
            <th scope="col" className={css.status}>Status</th>
            {columns.map(column => <th key={column.key} scope="col" className={css.question} title={`${column.section}: ${column.prompt}`}>
              <span className={css.qno}>{column.number}</span>
              <span className={css.prompt}>{column.prompt}</span>
              {readBy[column.visibility] && <Pill tone={readBy[column.visibility]!.tone}>{readBy[column.visibility]!.label}</Pill>}
            </th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map(row => <tr key={row.id}>
            <th scope="row" className={css.who}><strong>{row.name}</strong><small>{row.department || "Tanpa departemen"}</small></th>
            <td className={css.status}>
              <Pill tone={stateTone[row.state]}>{stateLabels[row.state]}</Pill>
              <small>{row.sectionsDone}/{row.sectionsTotal} bagian{row.lastActivity ? ` · ${when(row.lastActivity)}` : ""}</small>
            </td>
            {columns.map(column => {
              const text = row.cells[column.key];
              return <td key={column.key} className={css.answer}>{text ? <span title={text}>{text}</span> : <span className={css.empty} aria-label="Belum dijawab">–</span>}</td>;
            })}
          </tr>)}
        </tbody>
      </table>
    </div> : <p className={css.count}>Tidak ada orang yang cocok dengan saringan ini.</p>}
    <p className={css.note}>Bagian anonim tidak ada di tabel: jawabannya disimpan tanpa nama.{table.outside ? ` ${table.outside} orang yang sudah menjawab tidak tampil karena tidak aktif lagi atau tidak termasuk orang yang dituju.` : ""}</p>
  </div>;
}
