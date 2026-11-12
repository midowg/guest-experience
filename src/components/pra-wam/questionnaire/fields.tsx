"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Search, X } from "lucide-react";
import { baseChoice, isOtherOption, OTHER_LIMIT, otherText, withOther, type AnswerValue, type QQuestion } from "@/lib/pra-wam/questionnaire";
import { toggleChoice } from "./steps";
import styles from "./questionnaire.module.css";

export type Person = { id: string; name: string; department: string };
type Change = (value: AnswerValue, typing?: boolean) => void;
type Props = {
  question: QQuestion; value: AnswerValue | undefined; onChange: Change; labelledBy: string;
  departments: string[]; people: Person[]; onEnter?: () => void; onBlur?: () => void;
};

const asText = (value: AnswerValue | undefined) => typeof value === "string" ? value : "";
const asList = (value: AnswerValue | undefined) => Array.isArray(value) ? value : [];
const asRows = (value: AnswerValue | undefined) => value && typeof value === "object" && !Array.isArray(value) ? value : {};

/** One question's control, by kind. Text reports `typing` so saving can wait for a pause. */
export function QuestionField({ question, value, onChange, labelledBy, departments, people, onEnter, onBlur }: Props) {
  // Rows and choices build on the latest value, not the one of the last render, so quick taps
  // on several matrix rows (or choices) in a row never undo each other.
  const live = useRef(value);
  useEffect(() => { live.current = value; }, [value]);
  const commit = (next: AnswerValue) => { live.current = next; onChange(next); };
  switch (question.kind) {
    case "text":
      return <input className={styles.field} type="text" aria-labelledby={labelledBy} value={asText(value)} maxLength={300} autoComplete="off" enterKeyHint="next"
        placeholder={question.placeholder || "Tulis di sini"} onBlur={onBlur}
        onChange={event => onChange(event.target.value, true)}
        onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => { if (event.key === "Enter") { event.preventDefault(); onEnter?.(); } }} />;
    case "long": {
      const text = asText(value);
      return <>
        <textarea className={styles.field} aria-labelledby={labelledBy} value={text} maxLength={3000} placeholder={question.placeholder || "Tulis sebebasnya. Satu kalimat juga boleh."} onBlur={onBlur}
          onChange={event => onChange(event.target.value, true)}
          onKeyDown={event => { if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) { event.preventDefault(); onEnter?.(); } }} />
        {text.length > 2500 && <span className={styles.count} aria-live="polite">{text.length.toLocaleString("id-ID")} dari 3.000 karakter</span>}
      </>;
    }
    case "single": case "department": {
      const options = question.kind === "department" ? departments : question.options;
      if (!options.length) return <p className={styles.hint}>Daftar pilihan belum tersedia. Hubungi HR.</p>;
      const picked = baseChoice(asText(value));
      return <>
        <div className={styles.choices} role="group" aria-labelledby={labelledBy}>
          {options.map(option => <button key={option} type="button" className={styles.choice} aria-pressed={picked === option}
            onClick={() => { if (picked !== option) onChange(option); }}>
            <span className={styles.dot} aria-hidden />{option}
          </button>)}
        </div>
        {question.kind === "single" && isOtherOption(picked) && options.includes(picked) &&
          <OtherField option={picked} text={otherText(asText(value))} onText={text => onChange(withOther(picked, text), true)} onBlur={onBlur} onEnter={onEnter} />}
      </>;
    }
    case "multi": {
      const chosen = asList(value);
      const full = !!question.maxChoices && chosen.length >= question.maxChoices;
      const other = chosen.find(item => isOtherOption(baseChoice(item)) && question.options.includes(baseChoice(item)));
      return <>
        <p className={styles.hint}>{question.maxChoices ? `Pilih sampai ${question.maxChoices}` : "Boleh pilih lebih dari satu"}</p>
        <div className={styles.choices} role="group" aria-labelledby={labelledBy}>
          {question.options.map(option => {
            const on = chosen.some(item => baseChoice(item) === option);
            return <button key={option} type="button" className={`${styles.choice} ${styles.multi}`} aria-pressed={on} disabled={full && !on}
              onClick={() => {
                const list = asList(live.current);
                // "Lainnya: …" goes as a whole when "Lainnya" is tapped again.
                const given = list.find(item => item !== option && baseChoice(item) === option);
                commit(given ? list.filter(item => item !== given) : toggleChoice(list, option, question.maxChoices));
              }}>
              <span className={styles.dot} aria-hidden />{option}
            </button>;
          })}
        </div>
        {other && <OtherField option={baseChoice(other)} text={otherText(other)} onBlur={onBlur} onEnter={onEnter}
          onText={text => { const base = baseChoice(other); onChange(asList(live.current).map(item => baseChoice(item) === base ? withOther(base, text) : item), true); }} />}
      </>;
    }
    case "consent":
      return <label className={styles.consent}>
        <input type="checkbox" checked={value === true} onChange={event => onChange(event.target.checked)} />
        <span>{question.prompt}</span>
      </label>;
    case "matrix": {
      const rows = asRows(value);
      return <>
        <div className={styles.matrix}>
          {question.matrixRows.map(row => <div key={row} className={styles.mrow}>
            <b>{row}</b>
            <div className={styles.scale} role="group" aria-label={row}>
              {question.scale.map((step, index) => <button key={step} type="button" className={styles.choice} aria-pressed={rows[row] === step} aria-label={`${row}: ${index + 1}, ${step}`}
                onClick={() => commit({ ...asRows(live.current), [row]: step })}>{index + 1}</button>)}
            </div>
          </div>)}
        </div>
        {question.scale.length > 1 && <div className={styles.legend} aria-hidden>
          <span>1 {question.scale[0].toLowerCase()}</span><span>{question.scale.length} {question.scale.at(-1)!.toLowerCase()}</span>
        </div>}
      </>;
    }
    case "person":
      return <PersonPicker question={question} chosen={asList(value)} people={people} onChange={list => commit(list)} />;
  }
}

/** "Lainnya" chosen: where the person writes their own answer (12 Nov 2026). */
function OtherField({ option, text, onText, onBlur, onEnter }: { option: string; text: string; onText: (text: string) => void; onBlur?: () => void; onEnter?: () => void }) {
  const id = useId();
  return <div className={styles.other}>
    <label className={styles.hint} htmlFor={id}>{option}, tulis sendiri:</label>
    <input id={id} className={styles.field} type="text" value={text} maxLength={OTHER_LIMIT} autoComplete="off" enterKeyHint="next" autoFocus
      placeholder="Tulis jawabanmu" onBlur={onBlur} onChange={event => onText(event.target.value)}
      onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => { if (event.key === "Enter") { event.preventDefault(); onEnter?.(); } }} />
  </div>;
}

const fold = (text: string) => text.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** "Pilih rekan": search staff by name or department, choose up to `maxChoices`; stores employee ids. */
export function PersonPicker({ question, chosen, people, onChange }: { question: QQuestion; chosen: string[]; people: Person[]; onChange: (ids: string[]) => void }) {
  const [query, setQuery] = useState("");
  const searchId = useId();
  const byId = useMemo(() => new Map(people.map(person => [person.id, person])), [people]);
  const max = question.maxChoices ?? 3;
  const full = chosen.length >= max;
  const results = useMemo(() => {
    const words = fold(query).split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    return people.filter(person => !chosen.includes(person.id) && words.every(word => fold(`${person.name} ${person.department}`).includes(word))).slice(0, 8);
  }, [people, query, chosen]);
  return <div className={styles.picker}>
    {chosen.length > 0 && <ul className={styles.chips} aria-label="Rekan yang kamu pilih">
      {chosen.map(id => <li key={id} className={styles.chip}>
        {byId.get(id)?.name ?? "Rekan"}
        <button type="button" aria-label={`Hapus ${byId.get(id)?.name ?? "rekan"}`} onClick={() => onChange(chosen.filter(item => item !== id))}><X aria-hidden /></button>
      </li>)}
    </ul>}
    <label className={styles.hint} htmlFor={searchId}>{full ? `Sudah ${max} orang. Hapus satu untuk mengganti.` : `Cari nama atau departemen, pilih sampai ${max} orang.`}</label>
    <div className={styles.searchBox}>
      <input id={searchId} className={styles.field} type="search" value={query} onChange={event => setQuery(event.target.value)} disabled={full} autoComplete="off"
        placeholder="Ketik nama rekan" />
      <Search className={styles.searchIcon} aria-hidden />
    </div>
    {query.trim() && !full && (results.length
      ? <ul className={styles.results} aria-label="Hasil pencarian">
        {results.map(person => <li key={person.id}>
          <button type="button" className={styles.choice} onClick={() => { onChange([...chosen, person.id]); setQuery(""); }}>
            <span>{person.name}</span>{person.department && <small>{person.department}</small>}
          </button>
        </li>)}
      </ul>
      : <p className={styles.hint} role="status">Tidak ada nama yang cocok.</p>)}
  </div>;
}
