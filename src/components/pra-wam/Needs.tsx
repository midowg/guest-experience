"use client";

import { useState } from "react";
import { FilterChips, SectionToolbar, type FilterChip } from "@/components/console";
import cs from "@/components/console/console.module.css";
import type { NeedBlock } from "@/lib/pra-wam/needs";
import { needRows } from "./manage/needs-rows";
import styles from "./panitia.module.css";

/**
 * Kebutuhan peserta as one table (console "K5"): per question, each choice with how many and who,
 * written answers by name, and how many only HR reads. A search and one chip per question narrow
 * it. Rendered from needsOf, which already left out what the panitia may not see.
 */
export function NeedsList({ blocks }: { blocks: NeedBlock[] }) {
  const [query, setQuery] = useState("");
  const [only, setOnly] = useState("semua");
  const rows = needRows(blocks);
  const chips: FilterChip<string>[] = [{ value: "semua", label: "Semua" }, ...blocks.map(block => ({ value: block.key, label: block.title }))];
  const words = query.trim().toLowerCase();
  const shown = rows.filter(row => (only === "semua" || row.blockKey === only)
    && (!words || [row.answer, row.block, ...row.names].some(text => text.toLowerCase().includes(words))));
  return <section className={styles.section} aria-label="Rincian kebutuhan">
    <SectionToolbar title="Rincian" count={`${shown.length} baris`}
      search={{ label: "Cari kebutuhan atau nama", placeholder: "Cari kebutuhan atau nama", value: query, onChange: setQuery }} />
    <FilterChips label="Pertanyaan" chips={chips} value={only} onChange={setOnly} />
    {shown.length === 0 ? <p className={styles.empty}>Tidak ada yang cocok.</p> : <div className={cs.tableWrap}>
      <table className={cs.table}>
        <thead><tr><th>Kebutuhan</th><th>Jawaban</th><th>Jumlah</th><th>Nama</th></tr></thead>
        <tbody>{shown.map(row => <tr key={row.key}>
          <td><span className={styles.cellMain} title={`Pertanyaan ${row.blockKey}: ${row.prompt}`}><strong>{row.block}</strong><small>{row.purpose}</small></span></td>
          <td className={row.kind === "kosong" || row.kind === "hr" ? cs.tableMuted : undefined}><span className={row.written ? styles.answerText : undefined}>{row.answer}</span></td>
          <td>{row.kind === "kosong" ? "—" : `${row.count} orang`}</td>
          <td>
            {row.names.length > 0 && <ul className={styles.namesCell} aria-label={`Yang menjawab ${row.answer}`}>
              {row.names.map((name, index) => <li key={`${index}-${name}`} className={styles.nameChip}>{name}</li>)}
            </ul>}
            {row.note && <p className={styles.cellSub}>{row.note}</p>}
            {!row.names.length && !row.note && <span className={cs.tableMuted}>—</span>}
          </td>
        </tr>)}</tbody>
      </table>
    </div>}
  </section>;
}
