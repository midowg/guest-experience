"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Download, Printer, RefreshCw, Search } from "lucide-react";
import { errorMessage } from "@/components/admin/shared/api";
import { countByStatus, exportColumns, TARGET_STATUSES, targetLabels, wibInstantLabel, type CoachResponse, type CoachView as CoachData, type TargetStatus } from "@/lib/leadership-reset/form";
import { saveBlob, type CoachApi } from "./api";
import css from "./coach.module.css";

/*
 * The coach's reading page (19 Nov 2026), opened by the link the CMS makes. Every answer, newest
 * first: per leader (open one, or all), or per question (every leader's answer to one question in
 * a row, to see patterns). Search, filter by target, print, and Excel. Nothing here changes data.
 */

type Mode = "leader" | "pertanyaan";

export function CoachView({ initial, api, preview = false }: { initial: CoachData; api: CoachApi; preview?: boolean }) {
  const [data, setData] = useState(initial);
  const [mode, setMode] = useState<Mode>("leader");
  const [filter, setFilter] = useState<TargetStatus | "semua">("semua");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const [busy, setBusy] = useState<"refresh" | "excel" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { content, responses } = data;
  const counts = countByStatus(responses);
  const q = query.trim().toLowerCase();
  const shown = responses.filter(row => (filter === "semua" || row.targetStatus === filter)
    && (!q || `${row.name} ${row.team} ${row.answers.map(answer => answer.text).join(" ")}`.toLowerCase().includes(q)));
  const columns = useMemo(() => exportColumns(content.questions, responses), [content.questions, responses]);
  const allOpen = shown.length > 0 && shown.every(row => open.has(row.id));

  async function refresh() {
    setBusy("refresh"); setError(null);
    try { setData(await api.view()); } catch (failure) { setError(errorMessage(failure)); } finally { setBusy(null); }
  }
  async function excel() {
    setBusy("excel"); setError(null);
    try { saveBlob(await api.excel(), `refleksi-leader-${new Date().toISOString().slice(0, 10)}.xlsx`); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "Excel belum bisa dibuat."); }
    finally { setBusy(null); }
  }
  const toggle = (id: string) => setOpen(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });

  return <main className={css.page}>
    {preview && <p className={css.preview}>Pratinjau dengan data contoh.</p>}
    <header className={css.head}>
      <p className={css.kicker}>Refleksi Leader · untuk {content.coach}</p>
      <h1 className={css.title}>{content.title}</h1>
      {content.tagline && <p className={css.tagline}>“{content.tagline}”</p>}
      <div className={css.summary}>
        <p><strong>{responses.length}</strong> Leader sudah mengisi</p>
        {responses.length > 0 && <div className={css.bar} role="img" aria-label={TARGET_STATUSES.map(status => `${targetLabels[status]} ${counts[status]}`).join(", ")}>
          {TARGET_STATUSES.filter(status => counts[status]).map(status => <span key={status} data-status={status} style={{ flexGrow: counts[status] }} />)}
        </div>}
        <ul className={css.legend}>
          {TARGET_STATUSES.map(status => <li key={status} data-status={status}><i aria-hidden="true" />{targetLabels[status]} <strong>{counts[status]}</strong></li>)}
        </ul>
      </div>
    </header>

    <div className={css.toolbar}>
      <div className={css.modes} role="group" aria-label="Susunan">
        <button type="button" aria-pressed={mode === "leader"} onClick={() => setMode("leader")}>Per Leader</button>
        <button type="button" aria-pressed={mode === "pertanyaan"} onClick={() => setMode("pertanyaan")}>Per pertanyaan</button>
      </div>
      <label className={css.search}>
        <Search size={18} aria-hidden="true" />
        <span className="sr-only">Cari</span>
        <input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Cari nama, tim, atau kata di jawaban" />
      </label>
      <div className={css.chips} role="group" aria-label="Capaian target">
        {(["semua", ...TARGET_STATUSES] as const).map(value => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)} data-status={value}>
          {value === "semua" ? "Semua" : targetLabels[value]} <span>{value === "semua" ? responses.length : counts[value]}</span>
        </button>)}
      </div>
      <div className={css.tools}>
        {mode === "leader" && <button type="button" className={css.tool} onClick={() => setOpen(allOpen ? new Set() : new Set(shown.map(row => row.id)))} disabled={!shown.length}>{allOpen ? "Tutup semua" : "Buka semua"}</button>}
        <button type="button" className={css.tool} onClick={refresh} disabled={busy !== null}><RefreshCw size={16} aria-hidden="true" /> {busy === "refresh" ? "Memuat…" : "Muat ulang"}</button>
        <button type="button" className={css.tool} onClick={() => window.print()} disabled={!responses.length}><Printer size={16} aria-hidden="true" /> Cetak</button>
        <button type="button" className={css.toolPrimary} onClick={excel} disabled={busy !== null || !responses.length}><Download size={16} aria-hidden="true" /> {busy === "excel" ? "Menyiapkan…" : "Unduh Excel"}</button>
      </div>
    </div>
    {error && <p className={css.error} role="alert">{error}</p>}

    {responses.length === 0 ? <div className={css.empty}><strong>Belum ada jawaban</strong><p>Jawaban para Leader muncul di sini begitu mereka mengirim refleksi.</p></div>
      : shown.length === 0 ? <div className={css.empty}><strong>Tidak ada yang cocok</strong><p>Ubah pencarian atau filternya.</p></div>
        : mode === "leader"
          ? <ol className={css.list}>{shown.map(row => <LeaderCard key={row.id} row={row} open={open.has(row.id)} onToggle={() => toggle(row.id)} />)}</ol>
          : <div className={css.byQuestion}>{columns.map((column, index) => {
            const answered = shown.filter(row => row.answers.some(answer => answer.id === column.id && answer.text));
            return <section key={column.id} className={css.questionGroup} aria-labelledby={`q-${column.id}`}>
              <p className={css.qNumber}>Pertanyaan {index + 1} · {answered.length} jawaban</p>
              <h2 id={`q-${column.id}`} className={css.qLabel}>{column.label}</h2>
              {answered.length === 0 ? <p className={css.muted}>Belum ada jawaban untuk pertanyaan ini{filter !== "semua" || q ? " pada filter ini" : ""}.</p>
                : <ul className={css.quotes}>{answered.map(row => <li key={row.id}>
                  <p className={css.quote}>{row.answers.find(answer => answer.id === column.id)!.text}</p>
                  <p className={css.byline}><strong>{row.name}</strong> · {row.team} · <span data-status={row.targetStatus} className={css.pill}>{targetLabels[row.targetStatus]}</span></p>
                </li>)}</ul>}
            </section>;
          })}</div>}
    <p className={css.foot}>{content.closing}</p>
  </main>;
}

function LeaderCard({ row, open, onToggle }: { row: CoachResponse; open: boolean; onToggle: () => void }) {
  const first = row.answers[0]?.text ?? "";
  return <li className={css.card} data-open={open || undefined}>
    <button type="button" className={css.cardHead} onClick={onToggle} aria-expanded={open}>
      <span className={css.cardWho}>
        <strong>{row.name}</strong>
        <span>{row.team} · {wibInstantLabel(row.updatedAt)}</span>
      </span>
      <span data-status={row.targetStatus} className={css.pill}>{targetLabels[row.targetStatus]}</span>
      <ChevronDown size={20} aria-hidden="true" className={css.chevron} />
    </button>
    {!open && first && <p className={css.peek}>{first}</p>}
    <div className={css.cardBody} hidden={!open}>
      {row.answers.length === 0 ? <p className={css.muted}>Tidak ada jawaban tertulis.</p> : row.answers.map(answer => <article key={answer.id} className={css.answer}>
        <h3>{answer.label}</h3>
        <p>{answer.text}</p>
      </article>)}
    </div>
  </li>;
}
