"use client";

import { useDeferredValue, useId, useMemo, useState, type ReactNode } from "react";
import { CheckCircle2, ClipboardPaste } from "lucide-react";
import { ConsoleButton } from "@/components/console";
import type { ImportRow } from "@/lib/main-wam/admin/rundown";
import { MAX_PASTE_CHARS } from "@/lib/main-wam/admin/tsv";
import { Sheet } from "./Sheet";
import css from "./isi.module.css";

export type PasteResult<T> = { rows: ImportRow<T>[]; header: boolean };

/**
 * "Tempel dari Excel" for every isi acara import: paste the cells (tab-separated, as Excel and
 * Google Sheets copy them), see every row checked before anything is saved (what was read, or what
 * is wrong with it), and save only when every row is right. Nothing is saved row by row: the
 * server takes the whole paste in one transaction.
 */
export function PasteSheet<T, R extends PasteResult<T> = PasteResult<T>>({ title, subtitle, columns, example, parse, heads, cells, extra, busy, onSave, onClose, saveLabel = count => `Simpan ${count} baris` }: {
  title: string;
  subtitle?: ReactNode;
  /** The documented column order (when the paste has no header row). */
  columns: readonly string[];
  example: string;
  parse: (text: string) => R;
  /** The preview's columns (after Baris) and each checked row's cells. */
  heads: readonly string[];
  cells: (input: T) => ReactNode[];
  /** Above the paste box (a session picker, a mode). */
  extra?: ReactNode;
  busy: boolean;
  onSave: (result: R) => void;
  onClose: () => void;
  saveLabel?: (count: number) => string;
}) {
  const id = useId();
  const [text, setText] = useState("");
  const deferred = useDeferredValue(text);
  const result = useMemo(() => (deferred.trim() ? parse(deferred) : null), [deferred, parse]);
  const bad = result?.rows.filter(row => row.errors.length) ?? [];
  const good = result?.rows.filter(row => row.input) ?? [];
  const tooLong = text.length > MAX_PASTE_CHARS;
  const ready = !!result && good.length > 0 && bad.length === 0 && !tooLong && deferred === text;

  return <Sheet title={title} subtitle={subtitle} wide busy={busy} onClose={onClose} onSubmit={() => ready && result && onSave(result)}
    footer={<>
      <ConsoleButton disabled={busy} onClick={onClose}>Batal</ConsoleButton>
      <ConsoleButton type="submit" variant="primary" disabled={!ready || busy}>{busy ? "Menyimpan…" : good.length ? saveLabel(good.length) : "Simpan"}</ConsoleButton>
    </>}>
    {extra}
    <div className={css.field}>
      <label htmlFor={`${id}-paste`}>Tempel dari Excel</label>
      <p className={css.hint} id={`${id}-columns`}>Salin sel dari Excel atau Google Sheets, lalu tempel di sini. Baris pertama boleh berisi judul kolom; tanpa judul, urutannya:</p>
      <ul className={css.columns} aria-label="Urutan kolom">{columns.map(column => <li key={column}>{column}</li>)}</ul>
      <textarea id={`${id}-paste`} className={`textarea ${css.paste}`} value={text} spellCheck={false} aria-describedby={`${id}-columns`} placeholder={example}
        onChange={event => setText(event.target.value)} />
      {tooLong && <p className={css.error}>Tempelan terlalu panjang. Bagi menjadi beberapa kali impor.</p>}
    </div>
    {result ? <div className={css.section} aria-live="polite">
      <p className={css.note}>
        {bad.length ? <span className={css.error}>{bad.length} dari {result.rows.length} baris perlu diperbaiki. Perbaiki di Excel lalu tempel lagi.</span>
          : <span className={css.okText}><CheckCircle2 size={16} aria-hidden /> {good.length} baris siap disimpan.</span>}
        {result.header ? " Judul kolom terbaca dari baris pertama." : ""}
      </p>
      <div className={css.previewWrap} tabIndex={0} aria-label="Pratinjau baris">
        <table className={css.preview}>
          <thead><tr><th scope="col">Baris</th>{heads.map(head => <th key={head} scope="col">{head}</th>)}<th scope="col">Hasil</th></tr></thead>
          <tbody>{result.rows.map(row => <tr key={row.line} className={row.errors.length ? css.rowBad : undefined}>
            <td>{row.line}</td>
            {row.input ? cells(row.input).map((cell, index) => <td key={index}>{cell}</td>) : <td colSpan={heads.length}>{row.cells.filter(Boolean).join(" · ")}</td>}
            <td>{row.errors.length ? <ul className={css.rowProblems}>{row.errors.map(error => <li key={error}>{error}</li>)}</ul> : <span className={css.okText}>Siap</span>}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </div> : <div className={css.empty}>
      <ClipboardPaste size={24} aria-hidden />
      <p>Pratinjau tiap baris muncul di sini setelah ditempel. Belum ada yang tersimpan sampai Simpan ditekan.</p>
    </div>}
  </Sheet>;
}
