"use client";

import { useState, type FormEvent } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button, Field } from "@/components/ui";
import type { CardRule, Character, CharacterInput } from "@/lib/pra-wam/cards";
import styles from "./cards.module.css";

export type RuleQuestion = { key: string; prompt: string; options: string[] };
type Draft = { name: string; figure: string; class: string; title: string; description: string; powers: string; partnerId: string; hidden: boolean; rules: CardRule[] };

const toDraft = (character?: Character): Draft => ({
  name: character?.name ?? "", figure: character?.figure ?? "", class: character?.class ?? "", title: character?.title ?? "", description: character?.description ?? "",
  powers: (character?.powers ?? []).join(", "), partnerId: character?.partnerId ?? "", hidden: character?.hidden ?? false, rules: character?.rules ?? [],
});
export const inputOf = (draft: Draft): CharacterInput => ({
  name: draft.name, figure: draft.figure, class: draft.class, title: draft.title, description: draft.description,
  powers: draft.powers.split(",").map(power => power.trim()).filter(Boolean), partnerId: draft.partnerId || null, hidden: draft.hidden, rules: draft.rules,
});

/**
 * One character: its texts, partner, visibility and score rules ("this option of this question
 * adds this much"). Rules use the question's fixed key, so renaming a question keeps them; an
 * option that no longer exists is marked. Saving sends everything at once.
 */
export function CharacterEditor({ character, characters, questions, busy, errors, onSave, onCancel, onRemove }: {
  character?: Character; characters: Character[]; questions: RuleQuestion[]; busy: boolean; errors: Record<string, string>;
  onSave: (input: CharacterInput) => void; onCancel: () => void; onRemove?: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(character));
  const id = character?.id ?? "baru";
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft(current => ({ ...current, [key]: value }));
  const setRule = (index: number, patch: Partial<CardRule>) => set("rules", draft.rules.map((rule, at) => at === index ? { ...rule, ...patch } : rule));
  const byKey = new Map(questions.map(question => [question.key, question]));

  function submit(event: FormEvent) {
    event.preventDefault();
    onSave(inputOf(draft));
  }

  return <form className={styles.editor} onSubmit={submit} noValidate aria-label={character ? `Ubah ${character.name}` : "Karakter baru"}>
    <div className={styles.grid}>
      <Field label="Nama karakter" name={`ce-${id}-name`} error={errors.name} hint="Tertulis besar di kartu, misalnya Urban DJ.">
        <input id={`ce-${id}-name`} className="input" value={draft.name} maxLength={40} disabled={busy} onChange={event => set("name", event.target.value)} aria-invalid={!!errors.name} />
      </Field>
      <Field label="Kelas" name={`ce-${id}-class`} error={errors.class} hint="Peran di tim, misalnya Garda Depan.">
        <input id={`ce-${id}-class`} className="input" value={draft.class} maxLength={40} disabled={busy} onChange={event => set("class", event.target.value)} aria-invalid={!!errors.class} />
      </Field>
      <Field label="Nama tokoh" name={`ce-${id}-figure`} error={errors.figure} hint="Boleh kosong, misalnya Raka.">
        <input id={`ce-${id}-figure`} className="input" value={draft.figure} maxLength={40} disabled={busy} onChange={event => set("figure", event.target.value)} />
      </Field>
      <Field label="Partner ideal" name={`ce-${id}-partner`} error={errors.partnerId}>
        <select id={`ce-${id}-partner`} className="select" value={draft.partnerId} disabled={busy} onChange={event => set("partnerId", event.target.value)}>
          <option value="">Tanpa partner</option>
          {characters.filter(other => other.id !== character?.id).map(other => <option key={other.id} value={other.id}>{other.class} ({other.name})</option>)}
        </select>
      </Field>
    </div>
    <Field label="Judul" name={`ce-${id}-title`} error={errors.title} hint="Satu kalimat, misalnya: Yang maju duluan dan menyelesaikan sampai tuntas.">
      <input id={`ce-${id}-title`} className="input" value={draft.title} maxLength={120} disabled={busy} onChange={event => set("title", event.target.value)} />
    </Field>
    <Field label="Deskripsi" name={`ce-${id}-description`} error={errors.description} hint="Paling panjang 400 karakter.">
      <textarea id={`ce-${id}-description`} className="textarea" rows={3} value={draft.description} maxLength={400} disabled={busy} onChange={event => set("description", event.target.value)} />
    </Field>
    <Field label="Kekuatan" name={`ce-${id}-powers`} error={errors.powers} hint="Pisahkan dengan koma, paling banyak 5. Contoh: Eksekusi, Tahan banting, Apa adanya.">
      <input id={`ce-${id}-powers`} className="input" value={draft.powers} disabled={busy} onChange={event => set("powers", event.target.value)} />
    </Field>

    <fieldset className={styles.fieldset}>
      <legend>Aturan skor</legend>
      <p className={styles.muted}>Setiap pilihan jawaban di bawah menambah skor karakter ini. Skor tertinggi yang dipakai; kalau seri, diundi di antara yang seri.</p>
      {errors.rules && <p className="field-error">{errors.rules}</p>}
      {draft.rules.length ? <ul className={styles.rules}>
        {draft.rules.map((rule, index) => {
          const question = byKey.get(rule.questionKey);
          const missing = !question ? "Pertanyaan ini tidak ada lagi." : rule.option && !question.options.includes(rule.option) ? "Jawaban ini tidak ada lagi." : "";
          return <li key={index} className={styles.rule}>
            <label className={styles.ruleField}><span>Pertanyaan</span>
              <select className="select" value={rule.questionKey} disabled={busy} onChange={event => setRule(index, { questionKey: event.target.value, option: "" })}>
                {!question && <option value={rule.questionKey}>{rule.questionKey} (tidak ada lagi)</option>}
                {questions.map(item => <option key={item.key} value={item.key}>{item.key}. {item.prompt}</option>)}
              </select>
            </label>
            <label className={styles.ruleField}><span>Jawaban</span>
              <select className="select" value={rule.option} disabled={busy || !question} onChange={event => setRule(index, { option: event.target.value })}>
                <option value="">Pilih jawaban</option>
                {question && !question.options.includes(rule.option) && rule.option && <option value={rule.option}>{rule.option} (tidak ada lagi)</option>}
                {question?.options.map(option => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
            <label className={styles.ruleWeight}><span>Bobot</span>
              <select className="select" value={rule.weight} disabled={busy} onChange={event => setRule(index, { weight: Number(event.target.value) })}>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(weight => <option key={weight} value={weight}>+{weight}</option>)}
              </select>
            </label>
            <button type="button" className={styles.iconButton} aria-label={`Hapus aturan ${index + 1}`} disabled={busy} onClick={() => set("rules", draft.rules.filter((_, at) => at !== index))}><Trash2 size={18} aria-hidden /></button>
            {(missing || errors[`rules.${index}.option`] || errors[`rules.${index}.questionKey`]) && <p className={`field-error ${styles.ruleError}`}>{errors[`rules.${index}.questionKey`] ?? errors[`rules.${index}.option`] ?? missing}</p>}
          </li>;
        })}
      </ul> : <p className={styles.muted}>Belum ada aturan. Tanpa aturan, karakter ini hanya keluar bila tidak ada karakter lain yang punya skor.</p>}
      <div>
        <Button type="button" variant="secondary" disabled={busy || !questions.length} onClick={() => set("rules", [...draft.rules, { questionKey: questions[0]?.key ?? "", option: "", weight: 1 }])}><Plus size={18} aria-hidden /> Tambah aturan</Button>
      </div>
    </fieldset>

    <label className={styles.check}>
      <input type="checkbox" checked={draft.hidden} disabled={busy} onChange={event => set("hidden", event.target.checked)} />
      Sembunyikan (tidak diundi lagi; kartu yang sudah dimiliki tetap)
    </label>
    <div className={styles.actions}>
      <Button type="submit" disabled={busy}>{busy ? "Menyimpan…" : character ? "Simpan karakter" : "Tambah karakter"}</Button>
      <Button type="button" variant="quiet" disabled={busy} onClick={onCancel}>Batal</Button>
      {onRemove && <Button type="button" variant="danger" disabled={busy} onClick={onRemove}><Trash2 size={18} aria-hidden /> Hapus</Button>}
    </div>
  </form>;
}
