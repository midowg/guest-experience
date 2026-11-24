"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronRight, ClipboardList, Download, EyeOff, FileSpreadsheet, FileText, Lock, Search, X } from "lucide-react";
import { byDepartment, countStates, levelLabels, percent, type FillState, type SurveyData, type SurveyPerson, type SurveyQuestion } from "./types";
import css from "./bod-survey.module.css";

/*
 * Data kuesioner untuk BoD (prototipe 24 Nov 2026, /dev-preview/kuesioner-bod). A card on the BoD
 * Ringkasan, and one screen made for a phone: how many finished, Export at the top, then three
 * tabs: Ringkasan (each question summed up), Orang (each person's answers in a sheet) and
 * Departemen. The anonymous section is only summed up, never named.
 */

const stateLabels: Record<FillState, string> = { selesai: "Selesai", mengisi: "Sedang mengisi", belum: "Belum mulai" };
const initials = (name: string) => name.split(/\s+/).slice(0, 2).map(part => part[0] ?? "").join("").toUpperCase();
const dayTime = (iso: string) => new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(new Date(iso)).replace(":", ".");

/** A ring for "done out of everyone". */
function Ring({ value, size = 76 }: { value: number; size?: number }) {
  const r = (size - 10) / 2, length = 2 * Math.PI * r;
  return <svg className={css.ring} width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${value} persen selesai`}>
    <circle cx={size / 2} cy={size / 2} r={r} className={css.ringTrack} />
    <circle cx={size / 2} cy={size / 2} r={r} className={css.ringFill} strokeDasharray={`${(value / 100) * length} ${length}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
    <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle">{value}%</text>
  </svg>;
}

function LevelBadge({ level }: { level: SurveyQuestion["level"] }) {
  return <span className={`${css.level} ${css[`level_${level}`]}`}>{level === "hronly" ? <Lock aria-hidden /> : level === "anon" ? <EyeOff aria-hidden /> : null}{levelLabels[level]}</span>;
}

/* ---- The card on Ringkasan ------------------------------------------------------------------ */

export function BodSurveyCard({ data, href, exportHref }: { data: SurveyData; href: string; exportHref?: string }) {
  const counts = countStates(data.people);
  const share = percent(counts.selesai, data.people.length);
  return <section className={css.card} aria-labelledby="bod-survey-card">
    <a className={css.cardMain} href={href}>
      <span className={css.cardIcon}><ClipboardList aria-hidden /></span>
      <span className={css.cardText}>
        <small>Data kuesioner</small>
        <strong id="bod-survey-card">{data.formName}</strong>
        <span>{counts.selesai} dari {data.people.length} selesai · {data.questions.length} pertanyaan</span>
      </span>
      <Ring value={share} size={64} />
    </a>
    <div className={css.cardStats}>
      <span><b>{counts.selesai}</b> selesai</span>
      <span><b>{counts.mengisi}</b> mengisi</span>
      <span><b>{counts.belum}</b> belum</span>
    </div>
    <div className={css.cardActions}>
      <a className={css.cardOpen} href={href}>Lihat semua jawaban <ChevronRight aria-hidden /></a>
      {exportHref && <a className={css.cardExport} href={exportHref}><Download aria-hidden /> Export</a>}
    </div>
  </section>;
}

/* ---- The screen ------------------------------------------------------------------------------ */

type Tab = "ringkasan" | "orang" | "departemen";

export function BodSurveyScreen({ data, initialTab = "ringkasan", initialPerson = null, initialExport = false }: {
  data: SurveyData; initialTab?: Tab; initialPerson?: string | null; initialExport?: boolean;
}) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [person, setPerson] = useState<SurveyPerson | null>(() => data.people.find(item => item.id === initialPerson) ?? null);
  const [exporting, setExporting] = useState(initialExport);
  const counts = countStates(data.people);
  const share = percent(counts.selesai, data.people.length);
  return <div className={css.screen}>
    <header className={css.head}>
      <small>Kuesioner · data untuk BoD</small>
      <h1>{data.formName}</h1>
      <p>Diperbarui {dayTime(data.updatedAt)}{data.closesAt ? ` · ditutup ${dayTime(data.closesAt)}` : ""}</p>
    </header>

    <section className={css.hero} aria-label="Partisipasi">
      <Ring value={share} />
      <div className={css.heroText}>
        <strong>{counts.selesai} dari {data.people.length} karyawan selesai</strong>
        <ul className={css.legend}>
          <li><i className={css.dotDone} />{counts.selesai} selesai</li>
          <li><i className={css.dotStarted} />{counts.mengisi} mengisi</li>
          <li><i className={css.dotNone} />{counts.belum} belum</li>
        </ul>
      </div>
      <button type="button" className={`button button--primary ${css.exportButton}`} onClick={() => setExporting(true)}><Download size={18} aria-hidden /> Export data</button>
    </section>

    <div className={css.tabs} role="tablist" aria-label="Tampilan">
      {(["ringkasan", "orang", "departemen"] as const).map(key => <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? css.tabOn : css.tab} onClick={() => setTab(key)}>
        {key === "ringkasan" ? "Ringkasan" : key === "orang" ? `Orang · ${data.people.length}` : "Departemen"}
      </button>)}
    </div>

    {tab === "ringkasan" && <Summary data={data} />}
    {tab === "orang" && <People data={data} onOpen={setPerson} />}
    {tab === "departemen" && <Departments data={data} />}

    {person && <PersonSheet person={person} onClose={() => setPerson(null)} />}
    {exporting && <ExportSheet data={data} onClose={() => setExporting(false)} />}
  </div>;
}

function Summary({ data }: { data: SurveyData }) {
  return <div className={css.sections}>
    {data.sections.map(section => <section key={section.id} aria-labelledby={`bagian-${section.id}`}>
      <h2 id={`bagian-${section.id}`} className={css.sectionTitle}>{section.title}{section.anonymous && <span className={css.sectionNote}><EyeOff aria-hidden /> tanpa nama, hanya ringkasan</span>}</h2>
      <div className={css.questions}>
        {data.questions.filter(question => question.sectionId === section.id).map(question => <QuestionCard key={question.key} question={question} />)}
      </div>
    </section>)}
  </div>;
}

function QuestionCard({ question }: { question: SurveyQuestion }) {
  return <article className={css.question}>
    <header><span className={css.qNumber}>{question.number}</span><h3>{question.prompt}</h3></header>
    <p className={css.qMeta}><LevelBadge level={question.level} /><span>{question.answered} menjawab{question.kind === "pilihan" && question.multi ? " · boleh lebih dari satu" : ""}</span></p>
    {question.kind === "pilihan" && <ol className={css.bars}>
      {[...question.options].sort((a, b) => b.count - a.count).map(option => <li key={option.label}>
        <span className={css.barLabel}>{option.label}</span>
        <span className={css.barTrack}><span className={css.barFill} style={{ width: `${percent(option.count, question.answered)}%` }} /></span>
        <span className={css.barValue}>{option.count}<small> · {percent(option.count, question.answered)}%</small></span>
      </li>)}
    </ol>}
    {question.kind === "skala" && <div className={css.scale}>
      <div className={css.scaleBars}>{question.counts.map((count, i) => {
        const most = Math.max(...question.counts);
        return <span key={i} className={css.scaleCol}><b>{count}</b><span className={css.scaleBar} style={{ height: `${Math.max(6, (count / most) * 100)}%` }} /><small>{i + 1}</small></span>;
      })}</div>
      <p className={css.scaleEnds}><span>1 · {question.low}</span><span>5 · {question.high}</span></p>
      <p className={css.scaleAvg}>Rata-rata <b>{(question.counts.reduce((sum, count, i) => sum + count * (i + 1), 0) / Math.max(1, question.counts.reduce((a, b) => a + b, 0))).toFixed(1).replace(".", ",")}</b> dari 5</p>
    </div>}
    {question.kind === "teks" && <ul className={css.quotes}>
      {question.samples.map(sample => <li key={sample}>“{sample}”</li>)}
      {question.answered > question.samples.length && <li className={css.more}>+{question.answered - question.samples.length} jawaban lain{question.level === "anon" ? "" : " di tab Orang"}</li>}
    </ul>}
  </article>;
}

const filters: (FillState | "semua")[] = ["semua", "selesai", "mengisi", "belum"];

function People({ data, onOpen }: { data: SurveyData; onOpen(person: SurveyPerson): void }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FillState | "semua">("semua");
  const counts = countStates(data.people);
  const shown = useMemo(() => {
    const words = query.trim().toLowerCase();
    return data.people.filter(person => (filter === "semua" || person.state === filter) && (!words || `${person.name} ${person.department}`.toLowerCase().includes(words)))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [data.people, query, filter]);
  return <div className={css.people}>
    <label className={css.search}><Search aria-hidden /><input type="search" placeholder="Cari nama atau departemen" value={query} onChange={event => setQuery(event.target.value)} aria-label="Cari orang" /></label>
    <div className={css.chips} role="group" aria-label="Saring">
      {filters.map(key => <button key={key} type="button" aria-pressed={filter === key} className={filter === key ? css.chipOn : css.chip} onClick={() => setFilter(key)}>
        {key === "semua" ? `Semua ${data.people.length}` : `${stateLabels[key]} ${counts[key]}`}
      </button>)}
    </div>
    {shown.length === 0 ? <p className={css.empty}>Tidak ada yang cocok.</p>
      : <ul className={css.list}>{shown.map(person => <li key={person.id}>
        <button type="button" className={css.row} onClick={() => onOpen(person)} disabled={person.state === "belum"}>
          <span className={css.avatar}>{initials(person.name)}</span>
          <span className={css.rowText}><strong>{person.name}</strong><small>{person.department}{person.lastActivity ? ` · ${dayTime(person.lastActivity)}` : ""}</small></span>
          <span className={`${css.pill} ${css[`pill_${person.state}`]}`}>{person.state === "mengisi" ? `${person.sectionsDone}/${person.sectionsTotal}` : stateLabels[person.state]}</span>
          {person.state !== "belum" && <ChevronRight className={css.chevron} aria-hidden />}
        </button>
      </li>)}</ul>}
  </div>;
}

function Departments({ data }: { data: SurveyData }) {
  return <ul className={css.departments}>{byDepartment(data.people).map(group => <li key={group.name}>
    <div className={css.deptHead}><strong>{group.name}</strong><span>{group.done}/{group.total} selesai</span></div>
    <span className={css.stack} role="img" aria-label={`${group.done} selesai, ${group.started} mengisi, ${group.total - group.done - group.started} belum`}>
      <span className={css.stackDone} style={{ width: `${percent(group.done, group.total)}%` }} />
      <span className={css.stackStarted} style={{ width: `${percent(group.started, group.total)}%` }} />
    </span>
  </li>)}</ul>;
}

/** A bottom sheet on a phone, a centred panel on a wide screen. Esc and the backdrop close it. */
function Sheet({ title, onClose, children }: { title: string; onClose(): void; children: React.ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { const element = dialog.current; if (element && !element.open) element.showModal?.(); }, []);
  return <dialog ref={dialog} className={css.sheet} aria-label={title} onCancel={event => { event.preventDefault(); onClose(); }}
    onClick={event => { if (event.target === dialog.current) onClose(); }}>
    <div className={css.sheetInner}>
      <span className={css.grabber} aria-hidden />
      <header className={css.sheetHead}><h2>{title}</h2><button type="button" className={css.close} onClick={onClose} aria-label="Tutup"><X aria-hidden /></button></header>
      {children}
    </div>
  </dialog>;
}

function PersonSheet({ person, onClose }: { person: SurveyPerson; onClose(): void }) {
  return <Sheet title={person.name} onClose={onClose}>
    <p className={css.sheetMeta}>{person.department} · {stateLabels[person.state]}{person.state === "mengisi" ? ` (${person.sectionsDone} dari ${person.sectionsTotal} bagian)` : ""}</p>
    {person.sections.map(section => <section key={section.title} className={css.answerSection}>
      <h3>{section.title}</h3>
      <dl>{section.answers.map(item => <div key={item.prompt} className={css.answer}>
        <dt>{item.prompt} <LevelBadge level={item.level} /></dt>
        <dd>{item.answer}</dd>
      </div>)}</dl>
    </section>)}
    <p className={css.sheetNote}><EyeOff aria-hidden /> Jawaban di bagian tanpa nama tidak ditampilkan per orang.</p>
  </Sheet>;
}

type Format = "xlsx" | "csv";
type Scope = "jawaban" | "ringkasan";

function ExportSheet({ data, onClose }: { data: SurveyData; onClose(): void }) {
  const [format, setFormat] = useState<Format>("xlsx");
  const [scope, setScope] = useState<Scope>("jawaban");
  const [secret, setSecret] = useState(true);
  const [state, setState] = useState<"siap" | "membuat" | "selesai">("siap");
  const counts = countStates(data.people);
  const file = `${data.formName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${scope}.${format}`;
  function start() {
    setState("membuat");
    // Prototype: the real one asks the server for the file.
    window.setTimeout(() => setState("selesai"), 1200);
  }
  return <Sheet title="Export data kuesioner" onClose={onClose}>
    <fieldset className={css.options}>
      <legend>Isi</legend>
      <label><input type="radio" name="isi" checked={scope === "jawaban"} onChange={() => setScope("jawaban")} /><span><strong>Semua jawaban</strong>Satu baris per orang, satu kolom per pertanyaan ({counts.selesai + counts.mengisi} orang)</span></label>
      <label><input type="radio" name="isi" checked={scope === "ringkasan"} onChange={() => setScope("ringkasan")} /><span><strong>Ringkasan</strong>Jumlah dan persen tiap pilihan, termasuk bagian tanpa nama</span></label>
    </fieldset>
    <fieldset className={css.formats}>
      <legend>Format</legend>
      <label className={format === "xlsx" ? css.formatOn : css.format}><input type="radio" name="format" checked={format === "xlsx"} onChange={() => setFormat("xlsx")} /><FileSpreadsheet aria-hidden />Excel</label>
      <label className={format === "csv" ? css.formatOn : css.format}><input type="radio" name="format" checked={format === "csv"} onChange={() => setFormat("csv")} /><FileText aria-hidden />CSV</label>
    </fieldset>
    {scope === "jawaban" && <label className={css.toggle}><input type="checkbox" checked={secret} onChange={event => setSecret(event.target.checked)} /><span><strong>Ikut jawaban Rahasia</strong>Jawaban yang hanya untuk HR. Bagian tanpa nama tidak pernah ikut per orang.</span></label>}
    <button type="button" className={`button button--primary ${css.download}`} onClick={start} disabled={state === "membuat"}>
      {state === "membuat" ? <><span className={css.spinner} aria-hidden /> Menyiapkan berkas…</> : state === "selesai" ? <><Check size={18} aria-hidden /> Unduh lagi</> : <><Download size={18} aria-hidden /> Unduh {format === "xlsx" ? "Excel" : "CSV"}</>}
    </button>
    <p className={css.fileName} role="status">{state === "selesai" ? `Terunduh: ${file}` : file}</p>
  </Sheet>;
}
