"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Check, ChevronRight, Download, EyeOff, FileSpreadsheet, Lock, RotateCcw, Search, X } from "lucide-react";
import { fillLabels, levelBadge, percentOf, type BodPersonAnswers, type BodSurvey, type BodSurveyPerson, type FillState } from "@/lib/pra-wam/bod-survey";
import type { Visibility } from "@/lib/pra-wam/questionnaire";
import { MIN_GROUP, type RecapItem } from "@/lib/pra-wam/recap";
import { praWamApi } from "@/lib/routes";
import { errorText, praWamRequest, PraWamApiError } from "../api";
import { Ring } from "./Ring";
import css from "./bod-survey.module.css";

/*
 * Data kuesioner untuk BoD (24 Nov 2026), menu Analitik → Data kuesioner. One screen made for a
 * phone: how many finished and Export at the top, then three tabs: Ringkasan (each question summed
 * up, never a name), Orang (each person's answers BoD may read, in a sheet) and Departemen. Who
 * reads what is decided on the server (src/lib/server/pra-wam/bod-survey.ts).
 */

export type BodSurveyClient = {
  person(employeeId: string): Promise<BodPersonAnswers>;
  download(isi: Isi): Promise<{ blob: Blob; name: string }>;
};
type Isi = "jawaban" | "ringkasan";

export const serverBodSurveyClient: BodSurveyClient = {
  async person(employeeId) { return (await praWamRequest<BodPersonAnswers>(praWamApi.bodSurveyPerson(employeeId))).data; },
  async download(isi) {
    const response = await fetch(praWamApi.bodSurveyExport(isi), { credentials: "same-origin" }).catch(() => null);
    if (!response) throw new PraWamApiError("Tidak terhubung ke server. Periksa koneksi, lalu coba lagi.");
    if (!response.ok) {
      const body = await response.json().catch(() => null) as { message?: string } | null;
      throw new PraWamApiError(body?.message ?? "Berkas belum bisa dibuat. Coba lagi.");
    }
    const name = /filename="([^"]+)"/.exec(response.headers.get("content-disposition") ?? "")?.[1] ?? `kuesioner-${isi}.xlsx`;
    return { blob: await response.blob(), name };
  },
};

const initials = (name: string) => name.split(/\s+/).slice(0, 2).map(part => part[0] ?? "").join("").toUpperCase();
const dayTime = (iso: string) => new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(new Date(iso)).replace(":", ".");

function LevelBadge({ level }: { level: Visibility }) {
  return <span className={`${css.level} ${css[`level_${level}`]}`}>{level === "hronly" ? <Lock aria-hidden /> : level === "anon" ? <EyeOff aria-hidden /> : null}{levelBadge[level]}</span>;
}

type Tab = "ringkasan" | "orang" | "departemen";

export function BodSurveyScreen({ data, initialTab = "ringkasan", initialPerson = null, initialExport = false, client = serverBodSurveyClient }: {
  data: BodSurvey; initialTab?: Tab; initialPerson?: string | null; initialExport?: boolean; client?: BodSurveyClient;
}) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [person, setPerson] = useState<BodSurveyPerson | null>(() => data.people.find(item => item.employeeId === initialPerson) ?? null);
  const [exporting, setExporting] = useState(initialExport);
  const total = data.people.length;
  const share = percentOf(data.counts.selesai, total);
  return <div className={css.screen}>
    <header className={css.head}>
      <small>Kuesioner · data untuk BoD</small>
      <h1>{data.formName}</h1>
      {data.editUntil && <p>Bisa diisi sampai {dayTime(data.editUntil)} WIB</p>}
    </header>

    <section className={css.hero} aria-label="Partisipasi">
      <Ring value={share} />
      <div className={css.heroText}>
        <strong>{data.counts.selesai} dari {total} karyawan selesai</strong>
        <ul className={css.legend}>
          <li><i className={css.dotDone} />{data.counts.selesai} selesai</li>
          <li><i className={css.dotStarted} />{data.counts.sedang} mengisi</li>
          <li><i className={css.dotNone} />{data.counts.belum} belum</li>
        </ul>
      </div>
      <button type="button" className={`button button--primary ${css.exportButton}`} onClick={() => setExporting(true)}><Download size={18} aria-hidden /> Export data</button>
    </section>

    <div className={css.tabs} role="tablist" aria-label="Tampilan">
      {(["ringkasan", "orang", "departemen"] as const).map(key => <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? css.tabOn : css.tab} onClick={() => setTab(key)}>
        {key === "ringkasan" ? "Ringkasan" : key === "orang" ? `Orang · ${total}` : "Departemen"}
      </button>)}
    </div>

    {tab === "ringkasan" && <Summary data={data} />}
    {tab === "orang" && <People data={data} onOpen={setPerson} />}
    {tab === "departemen" && <Departments data={data} />}

    {person && <PersonSheet person={person} client={client} onClose={() => setPerson(null)} />}
    {exporting && <ExportSheet data={data} client={client} onClose={() => setExporting(false)} />}
  </div>;
}

function Summary({ data }: { data: BodSurvey }) {
  return <div className={css.sections}>
    {data.sections.map(section => <section key={section.key} aria-labelledby={`bagian-${section.key}`}>
      <h2 id={`bagian-${section.key}`} className={css.sectionTitle}>{section.title}{section.anonymous && <span className={css.sectionNote}><EyeOff aria-hidden /> tanpa nama, hanya ringkasan</span>}</h2>
      <div className={css.questions}>
        {section.items.length ? section.items.map((item, index) => <QuestionCard key={item.key} item={item} number={index + 1} />)
          : <p className={css.emptyCard}>Belum ada pertanyaan.</p>}
      </div>
    </section>)}
  </div>;
}

function QuestionCard({ item, number }: { item: RecapItem; number: number }) {
  const body = item.body;
  return <article className={css.question}>
    <header><span className={css.qNumber}>{number}</span><h3>{item.prompt}</h3></header>
    <p className={css.qMeta}><LevelBadge level={item.visibility} /><span>{item.answered} menjawab{item.several ? " · boleh lebih dari satu" : ""}</span></p>
    {body.type === "bars" && <Bars bars={body.bars} of={item.answered} rest={body.rest} />}
    {body.type === "matrix" && <Matrix scale={body.scale} rows={body.rows} />}
    {body.type === "quotes" && <Quotes quotes={body.quotes} />}
    {body.type === "needs-hr" && <p className={css.locked}><Lock aria-hidden /> Hanya HR yang membaca jawaban ini.</p>}
    {body.type === "few" && <p className={css.locked}><EyeOff aria-hidden /> Belum ditampilkan: kurang dari {MIN_GROUP} jawaban, supaya tidak bisa ditebak.</p>}
    {body.type === "none" && <p className={css.locked}>Belum ada jawaban.</p>}
  </article>;
}

function Bars({ bars, of, rest }: { bars: { label: string; count: number }[]; of: number; rest: number }) {
  return <ol className={css.bars}>
    {bars.map(bar => <li key={bar.label}>
      <span className={css.barLabel}>{bar.label}</span>
      <span className={css.barTrack}><span className={css.barFill} style={{ width: `${percentOf(bar.count, of)}%` }} /></span>
      <span className={css.barValue}>{bar.count}<small> · {percentOf(bar.count, of)}%</small></span>
    </li>)}
    {rest > 0 && <li className={css.more}>+{rest} lainnya</li>}
  </ol>;
}

/** Each row of a matrix as one bar split by the scale, darker toward the scale's end. */
function Matrix({ scale, rows }: { scale: string[]; rows: { label: string; counts: number[] }[] }) {
  const shade = (i: number) => `color-mix(in srgb, var(--pw-primary) ${Math.round(25 + (75 * i) / Math.max(1, scale.length - 1))}%, var(--pw-surface-soft))`;
  return <div className={css.matrix}>
    <ul className={css.matrixLegend}>{scale.map((label, i) => <li key={label}><i style={{ background: shade(i) }} />{label}</li>)}</ul>
    {rows.map(row => {
      const sum = row.counts.reduce((a, b) => a + b, 0);
      return <div key={row.label} className={css.matrixRow}>
        <span className={css.barLabel}>{row.label}</span>
        <span className={css.matrixBar} role="img" aria-label={row.counts.map((count, i) => `${scale[i]} ${count}`).join(", ")}>
          {row.counts.map((count, i) => count > 0 && <span key={i} style={{ width: `${percentOf(count, sum)}%`, background: shade(i) }} title={`${scale[i]}: ${count}`} />)}
        </span>
      </div>;
    })}
  </div>;
}

function Quotes({ quotes }: { quotes: { text: string; count: number }[] }) {
  const [all, setAll] = useState(false);
  const shown = all ? quotes : quotes.slice(0, 3);
  return <ul className={css.quotes}>
    {shown.map(quote => <li key={quote.text}>“{quote.text}”{quote.count > 1 && <span className={css.times}>×{quote.count}</span>}</li>)}
    {quotes.length > 3 && <li className={css.more}><button type="button" className={css.link} onClick={() => setAll(open => !open)}>{all ? "Tampilkan lebih sedikit" : `Lihat semua ${quotes.length} jawaban`}</button></li>}
  </ul>;
}

const filters: (FillState | "semua")[] = ["semua", "selesai", "sedang", "belum"];

function People({ data, onOpen }: { data: BodSurvey; onOpen(person: BodSurveyPerson): void }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FillState | "semua">("semua");
  const shown = useMemo(() => {
    const words = query.trim().toLowerCase();
    return data.people.filter(person => (filter === "semua" || person.state === filter) && (!words || `${person.name} ${person.department}`.toLowerCase().includes(words)));
  }, [data.people, query, filter]);
  return <div className={css.people}>
    <label className={css.search}><Search aria-hidden /><input type="search" placeholder="Cari nama atau departemen" value={query} onChange={event => setQuery(event.target.value)} aria-label="Cari orang" /></label>
    <div className={css.chips} role="group" aria-label="Saring">
      {filters.map(key => <button key={key} type="button" aria-pressed={filter === key} className={filter === key ? css.chipOn : css.chip} onClick={() => setFilter(key)}>
        {key === "semua" ? `Semua ${data.people.length}` : `${fillLabels[key]} ${data.counts[key]}`}
      </button>)}
    </div>
    {shown.length === 0 ? <p className={css.empty}>Tidak ada yang cocok.</p>
      : <ul className={css.list}>{shown.map(person => <li key={person.employeeId}>
        <button type="button" className={css.row} onClick={() => onOpen(person)} disabled={person.state === "belum"}>
          <span className={css.avatar}>{initials(person.name)}</span>
          <span className={css.rowText}><strong>{person.name}</strong><small>{person.department}{person.lastActivity ? ` · ${dayTime(person.lastActivity)}` : ""}</small></span>
          <span className={`${css.pill} ${css[`pill_${person.state}`]}`}>{person.state === "sedang" ? `${person.sectionsDone}/${person.sectionsTotal}` : fillLabels[person.state]}</span>
          {person.state !== "belum" && <ChevronRight className={css.chevron} aria-hidden />}
        </button>
      </li>)}</ul>}
  </div>;
}

function Departments({ data }: { data: BodSurvey }) {
  const sorted = [...data.departments].sort((a, b) => b.counts.selesai / Math.max(1, b.total) - a.counts.selesai / Math.max(1, a.total) || a.name.localeCompare(b.name, "id"));
  return <ul className={css.departments}>{sorted.map(group => <li key={group.name}>
    <div className={css.deptHead}><strong>{group.name}</strong><span>{group.counts.selesai}/{group.total} selesai</span></div>
    <span className={css.stack} role="img" aria-label={`${group.counts.selesai} selesai, ${group.counts.sedang} mengisi, ${group.counts.belum} belum`}>
      <span className={css.stackDone} style={{ width: `${percentOf(group.counts.selesai, group.total)}%` }} />
      <span className={css.stackStarted} style={{ width: `${percentOf(group.counts.sedang, group.total)}%` }} />
    </span>
  </li>)}</ul>;
}

/** A bottom sheet on a phone, a centred panel on a wide screen. Esc and the backdrop close it. */
function Sheet({ title, onClose, children }: { title: string; onClose(): void; children: ReactNode }) {
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

function PersonSheet({ person, client, onClose }: { person: BodSurveyPerson; client: BodSurveyClient; onClose(): void }) {
  const [state, setState] = useState<{ kind: "muat" } | { kind: "ada"; answers: BodPersonAnswers } | { kind: "gagal"; message: string }>({ kind: "muat" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    client.person(person.employeeId).then(answers => { if (live) setState({ kind: "ada", answers }); }, error => { if (live) setState({ kind: "gagal", message: errorText(error) }); });
    return () => { live = false; };
  }, [client, person.employeeId, attempt]);
  return <Sheet title={person.name} onClose={onClose}>
    <p className={css.sheetMeta}>{person.department} · {fillLabels[person.state]}{person.state === "sedang" ? ` (${person.sectionsDone} dari ${person.sectionsTotal} bagian)` : ""}</p>
    {state.kind === "muat" && <div className={css.skeleton} aria-busy="true" aria-label="Memuat jawaban"><span /><span /><span /></div>}
    {state.kind === "gagal" && <div className={css.failed} role="alert"><p>{state.message}</p><button type="button" className="button button--secondary" onClick={() => { setState({ kind: "muat" }); setAttempt(count => count + 1); }}><RotateCcw size={16} aria-hidden /> Coba lagi</button></div>}
    {state.kind === "ada" && (state.answers.sections.length === 0
      ? <p className={css.emptyCard}>Belum ada jawaban yang bisa dibaca BoD dari orang ini.</p>
      : state.answers.sections.map(section => <section key={section.title} className={css.answerSection}>
        <h3>{section.title}</h3>
        <dl>{section.answers.map(item => <div key={item.prompt} className={css.answer}>
          <dt>{item.prompt} <LevelBadge level={item.level} /></dt>
          <dd>{item.answer}</dd>
        </div>)}</dl>
      </section>))}
    <p className={css.sheetNote}><EyeOff aria-hidden /> Jawaban untuk panitia saja, Rahasia, dan bagian tanpa nama tidak ditampilkan per orang.</p>
  </Sheet>;
}

function ExportSheet({ data, client, onClose }: { data: BodSurvey; client: BodSurveyClient; onClose(): void }) {
  const [isi, setIsi] = useState<Isi>("jawaban");
  const [state, setState] = useState<{ kind: "siap" } | { kind: "membuat" } | { kind: "selesai"; name: string } | { kind: "gagal"; message: string }>({ kind: "siap" });
  async function start() {
    setState({ kind: "membuat" });
    try {
      const { blob, name } = await client.download(isi);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url; link.download = name;
      document.body.append(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setState({ kind: "selesai", name });
    } catch (error) {
      setState({ kind: "gagal", message: errorText(error) });
    }
  }
  const started = data.counts.selesai + data.counts.sedang;
  return <Sheet title="Export data kuesioner" onClose={onClose}>
    <fieldset className={css.options}>
      <legend>Isi berkas Excel</legend>
      <label><input type="radio" name="isi" checked={isi === "jawaban"} onChange={() => { setIsi("jawaban"); setState({ kind: "siap" }); }} /><span><strong>Semua jawaban</strong>Satu baris per orang, satu kolom per pertanyaan ({started} orang sudah mengisi)</span></label>
      <label><input type="radio" name="isi" checked={isi === "ringkasan"} onChange={() => { setIsi("ringkasan"); setState({ kind: "siap" }); }} /><span><strong>Ringkasan</strong>Jumlah tiap jawaban tanpa nama, termasuk bagian tanpa nama</span></label>
    </fieldset>
    <p className={css.sheetNote}><Lock aria-hidden /> Jawaban untuk panitia saja dan Rahasia tidak ikut. Berkas berisi data pribadi: simpan dengan aman.</p>
    <button type="button" className={`button button--primary ${css.download}`} onClick={() => void start()} disabled={state.kind === "membuat"}>
      {state.kind === "membuat" ? <><span className={css.spinner} aria-hidden /> Menyiapkan berkas…</> : state.kind === "selesai" ? <><Check size={18} aria-hidden /> Unduh lagi</> : <><FileSpreadsheet size={18} aria-hidden /> Unduh Excel</>}
    </button>
    {state.kind === "selesai" && <p className={css.fileName} role="status">Terunduh: {state.name}</p>}
    {state.kind === "gagal" && <p className={css.error} role="alert">{state.message}</p>}
  </Sheet>;
}
