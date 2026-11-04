"use client";

import { useState } from "react";
import { Eye, Search } from "lucide-react";
import { visibilityLabels, type QQuestion, type QSection } from "@/lib/pra-wam/questionnaire";
import styles from "./questionnaire.module.css";

type Previewed = Pick<QQuestion, "key" | "prompt" | "kind" | "required" | "visibility" | "options" | "maxChoices" | "matrixRows" | "scale" | "placeholder" | "note" | "react">;

/**
 * One question as a participant sees it on the phone: the section, the question, its "who reads
 * this" label, the answer control for its kind, and the little reaction after answering. The
 * controls can be tried; nothing is saved.
 */
export function QuestionPreview({ question, section, number, departments }: { question: Previewed | null; section: Pick<QSection, "title"> | null; number?: number; departments: string[] }) {
  const [picked, setPicked] = useState<string[]>([]);
  const [lastKey, setLastKey] = useState(question?.key);
  if (question?.key !== lastKey) { setLastKey(question?.key); setPicked([]); }

  if (!question) return <div className={styles.previewEmpty}>Pilih pertanyaan untuk melihat pratinjaunya.</div>;
  const toggle = (option: string) => {
    if (question.kind === "single") setPicked([option]);
    else setPicked(now => now.includes(option) ? now.filter(item => item !== option) : question.maxChoices && now.length >= question.maxChoices ? now : [...now, option]);
  };
  const reacted = picked.length > 0 && question.react;
  return <div className={styles.preview} aria-label="Pratinjau pertanyaan">
    <div className={styles.previewCard}>
      <p className={styles.previewEyebrow}>{section?.title || "Bagian"}{number ? ` · Pertanyaan ${number}` : ""}</p>
      <h3 className={styles.previewPrompt}>{question.prompt || "Tulis pertanyaannya…"}{question.required && <span className={styles.previewRequired} aria-label="wajib"> *</span>}</h3>
      <span className={styles.previewVis}><Eye size={14} aria-hidden />{visibilityLabels[question.visibility]}</span>
      {question.note && <p className={styles.previewNote}>{question.note}</p>}
      <Control question={question} departments={departments} picked={picked} toggle={toggle} setPicked={setPicked} />
      {reacted && <p className={styles.previewReact} role="status">{question.react}</p>}
    </div>
    <small className={styles.muted}>Pratinjau sederhana; tampilan di HP peserta memakai gaya halaman kuesioner. Isian di sini tidak disimpan.</small>
  </div>;
}

function Control({ question, departments, picked, toggle, setPicked }: {
  question: Previewed; departments: string[]; picked: string[]; toggle: (option: string) => void; setPicked: (next: string[]) => void;
}) {
  const label = `Jawaban untuk: ${question.prompt || "pertanyaan"}`;
  switch (question.kind) {
    case "text":
      return <input className={styles.previewInput} aria-label={label} placeholder={question.placeholder || "Tulis jawabanmu"} onChange={event => setPicked(event.target.value ? ["x"] : [])} />;
    case "long":
      return <textarea className={styles.previewInput} aria-label={label} placeholder={question.placeholder || "Tulis jawabanmu"} onChange={event => setPicked(event.target.value ? ["x"] : [])} />;
    case "consent":
      return <label className={styles.check}><input type="checkbox" onChange={event => setPicked(event.target.checked ? ["ya"] : [])} />Saya setuju</label>;
    case "single": case "multi":
      return <>
        {question.kind === "multi" && <p className={styles.previewNote}>{question.maxChoices ? `Pilih paling banyak ${question.maxChoices}.` : "Boleh pilih lebih dari satu."}</p>}
        {question.options.length
          ? <ul className={styles.previewOptions} aria-label={label}>{question.options.map(option => <li key={option}>
            <button type="button" className={styles.previewOption} aria-pressed={picked.includes(option)} onClick={() => toggle(option)}>{option}</button>
          </li>)}</ul>
          : <p className={styles.previewNote}>Belum ada pilihan.</p>}
      </>;
    case "department":
      return <select className={styles.previewInput} aria-label={label} defaultValue="" onChange={event => setPicked(event.target.value ? [event.target.value] : [])}>
        <option value="" disabled>Pilih departemen</option>
        {(departments.length ? departments : ["(Daftar dari Data karyawan)"]).map(name => <option key={name}>{name}</option>)}
      </select>;
    case "person":
      return <>
        <label className={styles.previewSearch}>
          <Search size={18} aria-hidden />
          <input aria-label={label} placeholder="Cari nama rekan" onChange={event => setPicked(event.target.value ? ["x"] : [])} />
        </label>
        <p className={styles.previewNote}>Daftar karyawan aktif dengan pencarian{question.maxChoices ? `, paling banyak ${question.maxChoices} orang` : ""}.</p>
      </>;
    case "matrix":
      if (!question.matrixRows.length || !question.scale.length) return <p className={styles.previewNote}>Isi baris dan skala untuk melihat matriksnya.</p>;
      return <table className={styles.previewMatrix}>
        <thead><tr><th scope="col"><span className="sr-only">Baris</span></th>{question.scale.map(step => <th key={step} scope="col">{step}</th>)}</tr></thead>
        <tbody>{question.matrixRows.map(row => <tr key={row}>
          <th scope="row">{row}</th>
          {question.scale.map(step => <td key={step}><input type="radio" name={`preview-${question.key}-${row}`} aria-label={`${row}: ${step}`} onChange={() => setPicked(["x"])} /></td>)}
        </tr>)}</tbody>
      </table>;
  }
}
