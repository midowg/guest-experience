"use client";

import { Fragment, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Bell, CheckCircle2, Circle, CircleDashed, Download, Trash2, Users } from "lucide-react";
import { ConsoleButton, ConsoleButtonLink, FilterChips, Pill, SearchField, StatCard, StatRow, type ConsoleTone } from "@/components/console";
import { Notice } from "@/components/ui";
import { useConfirm } from "@/components/pra-wam/ConfirmDialog";
import { adminRequest, errorMessage } from "@/components/admin/shared/api";
import { DELETE_ALL_WORD } from "@/lib/pra-wam/answer-delete";
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
/** What the search looks in (11 Nov 2026): the people, their answers, or the questions. */
type Scope = "orang" | "jawaban" | "pertanyaan";
const scopes: Record<Scope, { label: string; placeholder: string }> = {
  orang: { label: "Cari nama atau departemen", placeholder: "Cari nama atau departemen" },
  jawaban: { label: "Cari di jawaban", placeholder: "Kata di jawaban, mis. inhaler" },
  pertanyaan: { label: "Cari pertanyaan", placeholder: "Kata di pertanyaan, mis. kesehatan" },
};
/** "Belum dijawab" in the answer filter (no answer can be this). */
const UNANSWERED = "__belum_dijawab__";
const wordsOf = (query: string) => query.trim().toLocaleLowerCase("id").split(/\s+/).filter(Boolean);
const holdsAll = (text: string, words: string[]) => { const lower = text.toLocaleLowerCase("id"); return words.every(word => lower.includes(word)); };
/** One answer's values for the filter: a multiple choice gives each choice, a matrix each row's choice. */
const valuesOf = (text: string) => text.split(/\n|, /).map(value => value.replace(/^[^:]+: /, "").trim()).filter(Boolean);

/** The text with each searched word marked. */
function marked(text: string, words: string[]): ReactNode {
  if (!words.length) return text;
  const pattern = new RegExp(`(${words.map(word => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
  return text.split(pattern).map((part, index) => index % 2 ? <mark key={index} className={css.hit}>{part}</mark> : <Fragment key={index}>{part}</Fragment>);
}

/**
 * Admin WAM → Kuesioner → Rekap (11 Nov 2026): everything on one page. The counts, "Ingatkan", then
 * one table with a row per person (name, department, status) and a column per question with the
 * answer, HR and Rahasia included; filtered by name, department, status and section, and the same
 * table as Excel. The name stays in view while the answers scroll sideways. Since 11 Nov 2026 the
 * search also looks in the answers (the words marked) or the questions (the other columns hidden),
 * and "Saring jawaban" keeps the people who gave one answer to one question.
 *
 * 12 Nov 2026: answers can be deleted. Tick people (or every row shown) and "Hapus jawaban": their
 * named answers go and they are back to "Belum mulai". "Hapus semua data" (typing HAPUS) deletes
 * every answer, anonymous ones too, and the room pairing.
 */
export function AnswerTable({ table, reminder }: { table: Table; reminder: ReminderState }) {
  const router = useRouter();
  const [confirm, confirmDialog] = useConfirm();
  const [query, setQuery] = useState("");
  const [department, setDepartment] = useState("");
  const [state, setState] = useState<StateFilter>("semua");
  const [section, setSection] = useState("");
  const [scope, setScope] = useState<Scope>("orang");
  // The answer filter: one question, then one of its answers (or none given).
  const [filterKey, setFilterKey] = useState("");
  const [filterValue, setFilterValue] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  // Deleting answers (12 Nov 2026).
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [deleting, setDeleting] = useState(false);
  const [wipeOpen, setWipeOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [deleted, setDeleted] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const total = table.rows.length;
  const departments = useMemo(() => [...new Set(table.rows.map(row => row.department).filter(Boolean))].sort((a, b) => a.localeCompare(b, "id")), [table.rows]);
  const words = useMemo(() => wordsOf(query), [query]);
  const inSection = useMemo(() => section ? table.columns.filter(column => column.sectionId === section) : table.columns, [table.columns, section]);
  // Searching the questions keeps only the columns that hold the words.
  const columns = useMemo(() => scope === "pertanyaan" && words.length ? inSection.filter(column => holdsAll(`${column.number} ${column.prompt} ${column.section}`, words)) : inSection, [scope, words, inSection]);
  const filterColumn = table.columns.find(column => column.key === filterKey);
  const filterValues = useMemo(() => filterColumn
    ? [...new Set(table.rows.flatMap(row => row.cells[filterColumn.key] ? valuesOf(row.cells[filterColumn.key]) : []))].sort((a, b) => a.localeCompare(b, "id"))
    : [], [table.rows, filterColumn]);
  const rows = useMemo(() => table.rows.filter(row => {
    if (state !== "semua" && row.state !== state) return false;
    if (department && row.department !== department) return false;
    if (filterColumn && filterValue) {
      const text = row.cells[filterColumn.key];
      if (filterValue === UNANSWERED ? !!text : !text || !valuesOf(text).includes(filterValue)) return false;
    }
    if (!words.length) return true;
    if (scope === "orang") return holdsAll(`${row.name} ${row.department}`, words);
    // Searching the answers: a person with every word in one of the answers shown.
    if (scope === "jawaban") return columns.some(column => !!row.cells[column.key] && holdsAll(row.cells[column.key], words));
    return true;
  }), [table.rows, state, department, filterColumn, filterValue, words, scope, columns]);
  const hits = scope === "jawaban" ? words : [];

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

  const shownIds = rows.map(row => row.id);
  const allShown = shownIds.length > 0 && shownIds.every(id => selected.has(id));
  // A person chosen and then filtered away stays chosen: the bar says how many in all.
  const chosen = table.rows.filter(row => selected.has(row.id));
  const toggle = (id: string, on: boolean) => setSelected(current => { const next = new Set(current); if (on) next.add(id); else next.delete(id); return next; });
  const toggleShown = (on: boolean) => setSelected(current => { const next = new Set(current); for (const id of shownIds) { if (on) next.add(id); else next.delete(id); } return next; });

  async function remove(body: object, done: () => void) {
    setDeleting(true); setDeleted(null);
    try {
      const result = await adminRequest(praWamQuestionnaireApi.answers, { method: "DELETE", body: JSON.stringify(body) });
      setDeleted({ tone: "success", text: result.message });
      done();
      router.refresh();
    } catch (problem) { setDeleted({ tone: "error", text: errorMessage(problem) }); }
    finally { setDeleting(false); }
  }
  async function removeChosen() {
    const names = chosen.slice(0, 3).map(row => row.name).join(", ") + (chosen.length > 3 ? `, dan ${chosen.length - 3} orang lain` : "");
    if (!(await confirm({
      title: `Hapus jawaban ${chosen.length} orang?`,
      body: `Jawaban ${names} dihapus permanen dan statusnya kembali Belum mulai. Mereka bisa mengisi lagi dari awal. Jawaban anonim tidak ikut terhapus.`,
      confirmLabel: "Hapus jawaban", danger: true,
    }))) return;
    await remove({ who: "pilih", employeeIds: chosen.map(row => row.id) }, () => setSelected(new Set()));
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
      <label className={css.scope}><span className="sr-only">Cari di</span>
        <select className="input" value={scope} onChange={event => setScope(event.target.value as Scope)}>
          <option value="orang">Cari di nama</option>
          <option value="jawaban">Cari di jawaban</option>
          <option value="pertanyaan">Cari di pertanyaan</option>
        </select>
      </label>
      <SearchField label={scopes[scope].label} placeholder={scopes[scope].placeholder} value={query} onChange={setQuery} />
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
    {/* Who answered what (11 Nov 2026): one question, then one of its answers. */}
    <div className={css.tools} role="group" aria-label="Saring jawaban">
      <span className={css.toolLabel}>Saring jawaban</span>
      <label className={css.select}><span className="sr-only">Pertanyaan untuk disaring</span>
        <select className="input" value={filterKey} onChange={event => { setFilterKey(event.target.value); setFilterValue(""); }}>
          <option value="">Pilih pertanyaan</option>
          {table.sections.map(item => <optgroup key={item.id} label={item.title}>
            {table.columns.filter(column => column.sectionId === item.id).map(column => <option key={column.key} value={column.key}>{column.number}. {column.prompt}</option>)}
          </optgroup>)}
        </select>
      </label>
      <label className={css.select}><span className="sr-only">Jawaban untuk disaring</span>
        <select className="input" value={filterValue} disabled={!filterColumn} onChange={event => setFilterValue(event.target.value)}>
          <option value="">{filterColumn ? "Semua jawaban" : "Pilih pertanyaan dulu"}</option>
          {filterValues.map(value => <option key={value} value={value}>{value.length > 80 ? `${value.slice(0, 80)}…` : value}</option>)}
          {filterColumn && <option value={UNANSWERED}>Belum dijawab</option>}
        </select>
      </label>
      {(filterKey || query || department || section || state !== "semua") && <ConsoleButton onClick={() => { setQuery(""); setDepartment(""); setSection(""); setState("semua"); setFilterKey(""); setFilterValue(""); }}>Hapus saringan</ConsoleButton>}
    </div>
    <FilterChips<StateFilter> label="Status" value={state} onChange={setState} chips={[
      { value: "semua", label: "Semua", count: total },
      { value: "selesai", label: stateLabels.selesai, count: table.counts.selesai },
      { value: "sedang", label: stateLabels.sedang, count: table.counts.sedang },
      { value: "belum", label: stateLabels.belum, count: table.counts.belum },
    ]} />

    {chosen.length > 0 && <div className={css.chosen} role="group" aria-label="Orang yang dipilih">
      <p>{chosen.length} orang dipilih</p>
      <ConsoleButton className={css.danger} disabled={deleting} onClick={() => void removeChosen()} icon={<Trash2 size={18} aria-hidden="true" />}>
        {deleting ? "Menghapus…" : `Hapus jawaban (${chosen.length})`}
      </ConsoleButton>
      <ConsoleButton disabled={deleting} onClick={() => setSelected(new Set())}>Batal pilih</ConsoleButton>
    </div>}
    {deleted && <Notice tone={deleted.tone}>{deleted.text}</Notice>}

    <p className={css.count} aria-live="polite">{rows.length} dari {total} orang · {columns.length} pertanyaan. Geser tabel ke samping untuk melihat semua jawaban.</p>
    {scope === "pertanyaan" && words.length > 0 && !columns.length ? <p className={css.count}>Tidak ada pertanyaan yang cocok dengan pencarian ini.</p>
      : rows.length ? <div className={css.scroller} role="region" aria-label="Tabel jawaban" tabIndex={0}>
      <table className={css.table}>
        <thead>
          <tr>
            <th scope="col" className={css.who}>
              <label className={css.pick}>
                <input type="checkbox" checked={allShown} aria-label={`Pilih semua yang tampil (${rows.length} orang)`} onChange={event => toggleShown(event.target.checked)} />
                <span>Nama</span>
              </label>
            </th>
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
            <th scope="row" className={css.who}>
              <label className={css.pick}>
                <input type="checkbox" checked={selected.has(row.id)} aria-label={`Pilih ${row.name}`} onChange={event => toggle(row.id, event.target.checked)} />
                <span><strong>{row.name}</strong><small>{row.department || "Tanpa departemen"}</small></span>
              </label>
            </th>
            <td className={css.status}>
              <Pill tone={stateTone[row.state]}>{stateLabels[row.state]}</Pill>
              <small>{row.sectionsDone}/{row.sectionsTotal} bagian{row.lastActivity ? ` · ${when(row.lastActivity)}` : ""}</small>
            </td>
            {columns.map(column => {
              const text = row.cells[column.key];
              return <td key={column.key} className={css.answer}>{text ? <span title={text}>{marked(text, hits)}</span> : <span className={css.empty} aria-label="Belum dijawab">–</span>}</td>;
            })}
          </tr>)}
        </tbody>
      </table>
    </div> : <p className={css.count}>Tidak ada orang yang cocok dengan saringan ini.</p>}
    <p className={css.note}>Bagian anonim tidak ada di tabel: jawabannya disimpan tanpa nama.{table.outside ? ` ${table.outside} orang yang sudah menjawab tidak tampil karena tidak aktif lagi atau tidak termasuk orang yang dituju.` : ""}</p>

    {/* Starting again (12 Nov 2026): every answer, anonymous ones and the room pairing too. */}
    <div className={css.wipe}>
      <div>
        <p className={css.wipeTitle}>Hapus semua data kuesioner</p>
        <p className={css.note}>Semua jawaban (termasuk anonim) dan penempatan kamar dihapus permanen. Semua orang kembali Belum mulai. Unduh Excel dulu bila perlu arsip.</p>
      </div>
      {!wipeOpen ? <ConsoleButton className={css.danger} onClick={() => { setWipeOpen(true); setTyped(""); }} icon={<Trash2 size={18} aria-hidden="true" />}>Hapus semua data</ConsoleButton>
        : <div className={css.wipeConfirm}>
          <label><span className={css.toolLabel}>Ketik {DELETE_ALL_WORD} untuk lanjut</span>
            <input className="input" value={typed} autoComplete="off" onChange={event => setTyped(event.target.value)} />
          </label>
          <ConsoleButton className={css.danger} disabled={deleting || typed.trim() !== DELETE_ALL_WORD}
            onClick={() => void remove({ who: "semua", confirm: DELETE_ALL_WORD }, () => { setWipeOpen(false); setTyped(""); setSelected(new Set()); })}
            icon={<Trash2 size={18} aria-hidden="true" />}>{deleting ? "Menghapus…" : "Hapus semua sekarang"}</ConsoleButton>
          <ConsoleButton disabled={deleting} onClick={() => setWipeOpen(false)}>Batal</ConsoleButton>
        </div>}
    </div>
  </div>;
}
