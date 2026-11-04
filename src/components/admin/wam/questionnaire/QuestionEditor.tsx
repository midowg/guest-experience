"use client";

import { useId, useState, type FormEvent } from "react";
import { Button, Field, Notice } from "@/components/ui";
import { questionKinds, visibilities, type QQuestion, type QSection, type QuestionKind, type ShowIf, type Visibility } from "@/lib/pra-wam/questionnaire";
import { kindLabels, visibilityHelp, visibilityShort } from "./labels";
import styles from "./questionnaire.module.css";

/** What the editor holds while typing: lists as one item per line, the limit as text. */
export type QuestionDraft = {
  sectionId: string; prompt: string; kind: QuestionKind; required: boolean; visibility: Visibility;
  options: string; maxChoices: string; matrixRows: string; scale: string; placeholder: string; note: string; react: string;
  showIfQuestion: string; showIfMode: "any" | "not"; showIfOptions: string[]; hidden: boolean;
};
/** What the server takes (questionFields in questionnaire-admin). */
export type QuestionPayload = {
  sectionId: string; prompt: string; kind: QuestionKind; required: boolean; visibility: Visibility; options: string[]; maxChoices: number | null;
  matrixRows: string[]; scale: string[]; placeholder: string; note: string; react: string; showIf: ShowIf | null; hidden: boolean;
};
export type FieldErrors = Record<string, string[]>;

const lines = (value: string) => value.split(/\r?\n/).map(item => item.replace(/\s+/g, " ").trim()).filter(Boolean);
const choiceKinds: QuestionKind[] = ["single", "multi", "department"];

export function toDraft(question: QQuestion): QuestionDraft {
  return {
    sectionId: question.sectionId, prompt: question.prompt, kind: question.kind, required: question.required, visibility: question.visibility,
    options: question.options.join("\n"), maxChoices: question.maxChoices ? String(question.maxChoices) : "", matrixRows: question.matrixRows.join("\n"),
    scale: question.scale.join("\n"), placeholder: question.placeholder, note: question.note, react: question.react,
    showIfQuestion: question.showIf?.question ?? "", showIfMode: question.showIf?.not?.length ? "not" : "any",
    showIfOptions: question.showIf?.not?.length ? question.showIf.not : question.showIf?.any ?? [], hidden: question.hidden,
  };
}

export function newDraft(section: Pick<QSection, "id" | "anonymous">): QuestionDraft {
  return {
    sectionId: section.id, prompt: "", kind: "text", required: false, visibility: section.anonymous ? "anon" : "fasil", options: "", maxChoices: "",
    matrixRows: "", scale: "", placeholder: "", note: "", react: "", showIfQuestion: "", showIfMode: "any", showIfOptions: [], hidden: false,
  };
}

export function fromDraft(draft: QuestionDraft): QuestionPayload {
  const max = Number(draft.maxChoices);
  return {
    sectionId: draft.sectionId, prompt: draft.prompt.trim(), kind: draft.kind, required: draft.required, visibility: draft.visibility,
    options: draft.kind === "single" || draft.kind === "multi" ? lines(draft.options) : [],
    maxChoices: (draft.kind === "multi" || draft.kind === "person") && draft.maxChoices.trim() ? (Number.isFinite(max) ? max : NaN) : null,
    matrixRows: draft.kind === "matrix" ? lines(draft.matrixRows) : [], scale: draft.kind === "matrix" ? lines(draft.scale) : [],
    placeholder: draft.kind === "text" || draft.kind === "long" ? draft.placeholder.trim() : "", note: draft.note.trim(), react: draft.react.trim(),
    showIf: draft.showIfQuestion ? { question: draft.showIfQuestion, [draft.showIfMode]: draft.showIfOptions } : null, hidden: draft.hidden,
  };
}

/** The quick checks the editor can make itself; the server checks everything again. */
export function draftProblems(payload: QuestionPayload): FieldErrors {
  const problems: FieldErrors = {};
  if (payload.prompt.length < 2) problems.prompt = ["Tulis pertanyaannya, minimal 2 karakter."];
  if ((payload.kind === "single" || payload.kind === "multi") && payload.options.length < 2) problems.options = ["Isi minimal 2 pilihan, satu per baris."];
  if (payload.maxChoices !== null && (!Number.isInteger(payload.maxChoices) || payload.maxChoices < 1 || payload.maxChoices > 20)) problems.maxChoices = ["Batas pilihan 1 sampai 20, atau kosongkan."];
  if (payload.kind === "matrix" && !payload.matrixRows.length) problems.matrixRows = ["Isi minimal 1 baris."];
  if (payload.kind === "matrix" && payload.scale.length < 2) problems.scale = ["Isi minimal 2 pilihan skala."];
  if (payload.showIf && !(payload.showIf.any?.length || payload.showIf.not?.length)) problems.showIf = ["Pilih minimal satu jawaban acuan."];
  return problems;
}

/**
 * The inline editor of one question (or a new one): text, kind and what the kind needs, who reads
 * it, the show-if rule, the section it sits in, and hidden. `onDraft` feeds the live preview;
 * `onSave` returns the server's field errors, if any. The key is shown, never edited.
 */
export function QuestionEditor({ initial, questionKey, sections, questions, departments, answered, onDraft, onSave, onCancel, onDelete }: {
  initial: QuestionDraft; questionKey: string | null; sections: QSection[]; questions: QQuestion[]; departments: string[]; answered: boolean;
  onDraft?: (draft: QuestionDraft) => void; onSave: (payload: QuestionPayload) => Promise<FieldErrors | null>; onCancel: () => void; onDelete?: () => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);
  const section = sections.find(item => item.id === draft.sectionId);
  const set = <K extends keyof QuestionDraft>(key: K, value: QuestionDraft[K]) => {
    const next = { ...draft, [key]: value };
    if (key === "sectionId") {
      const target = sections.find(item => item.id === value);
      if (target?.anonymous) next.visibility = "anon";
      else if (next.visibility === "anon") next.visibility = "fasil";
    }
    if (key === "showIfQuestion") next.showIfOptions = [];
    setDraft(next); onDraft?.(next);
    const errorKey = key.startsWith("showIf") ? "showIf" : key;
    if (errors[errorKey]?.length) setErrors({ ...errors, [errorKey]: [] });
  };
  const error = (key: string) => errors[key]?.[0];
  const field = (key: string) => `${id}-${key}`;
  const described = (key: string, hint = false) => [hint ? `${field(key)}-hint` : "", error(key) ? `${field(key)}-error` : ""].filter(Boolean).join(" ") || undefined;

  // The show-if targets: choice questions of the form, not this one, and never an anonymous answer for a named question.
  const anonymousSections = new Set(sections.filter(item => item.anonymous).map(item => item.id));
  const targets = questions.filter(item => item.key !== questionKey && choiceKinds.includes(item.kind) && (!anonymousSections.has(item.sectionId) || section?.anonymous));
  const target = questions.find(item => item.key === draft.showIfQuestion);
  const targetOptions = target ? (target.kind === "department" ? departments : target.options) : [];
  const allowed = section?.anonymous ? (["anon"] as Visibility[]) : visibilities.filter(item => item !== "anon");

  async function submit(event: FormEvent) {
    event.preventDefault();
    const payload = fromDraft(draft);
    const problems = draftProblems(payload);
    setErrors(problems);
    if (Object.keys(problems).length) return;
    setSaving(true);
    try {
      const fromServer = await onSave(payload);
      if (fromServer) setErrors(fromServer);
    } finally { setSaving(false); }
  }

  const hasErrors = Object.values(errors).some(list => list?.length);
  return <form className={styles.editor} noValidate onSubmit={submit} aria-label={questionKey ? `Ubah pertanyaan ${questionKey}` : "Pertanyaan baru"}>
    {questionKey
      ? <p className={styles.keyNote}>Kunci <code>{questionKey}</code> tetap, supaya jawaban tidak terputus saat teksnya diubah.</p>
      : <p className={styles.keyNote}>Kunci dibuat otomatis saat disimpan dan tidak berubah lagi.</p>}

    <Field label="Pertanyaan" name={field("prompt")} error={error("prompt")}>
      <textarea id={field("prompt")} className="textarea" rows={2} value={draft.prompt} maxLength={320} onChange={event => set("prompt", event.target.value)}
        aria-invalid={!!error("prompt")} aria-describedby={described("prompt")} style={{ minHeight: 72 }} />
    </Field>

    <div className={styles.editorGrid}>
      <Field label="Tipe" name={field("kind")} error={error("kind")} hint={answered && questionKey ? "Setelah ada jawaban, tipe tidak bisa diubah." : undefined}>
        <select id={field("kind")} className="select" value={draft.kind} onChange={event => set("kind", event.target.value as QuestionKind)}
          aria-invalid={!!error("kind")} aria-describedby={described("kind", answered && !!questionKey)}>
          {questionKinds.map(kind => <option key={kind} value={kind}>{kindLabels[kind]}</option>)}
        </select>
      </Field>
      <Field label="Siapa yang bisa membaca" name={field("visibility")} error={error("visibility")} hint={visibilityHelp[draft.visibility]}>
        <select id={field("visibility")} className="select" value={draft.visibility} onChange={event => set("visibility", event.target.value as Visibility)}
          aria-invalid={!!error("visibility")} aria-describedby={described("visibility", true)}>
          {allowed.map(level => <option key={level} value={level}>{visibilityShort[level]}</option>)}
        </select>
      </Field>
      <Field label="Bagian" name={field("sectionId")} error={error("sectionId")} hint={questionKey ? "Pindah bagian: pertanyaan masuk ke akhir bagian itu." : undefined}>
        <select id={field("sectionId")} className="select" value={draft.sectionId} onChange={event => set("sectionId", event.target.value)}
          aria-invalid={!!error("sectionId")} aria-describedby={described("sectionId", !!questionKey)}>
          {sections.map(item => <option key={item.id} value={item.id}>{item.title}{item.anonymous ? " (anonim)" : ""}{item.hidden ? " (disembunyikan)" : ""}</option>)}
        </select>
      </Field>
    </div>

    <div className={styles.actions}>
      <label className={styles.check}><input type="checkbox" checked={draft.required} onChange={event => set("required", event.target.checked)} />Wajib dijawab</label>
      <label className={styles.check}><input type="checkbox" checked={draft.hidden} onChange={event => set("hidden", event.target.checked)} />Sembunyikan dari peserta</label>
    </div>

    {(draft.kind === "single" || draft.kind === "multi") && <Field label="Pilihan" name={field("options")} error={error("options")} hint="Satu pilihan per baris.">
      <textarea id={field("options")} className="textarea" rows={5} value={draft.options} onChange={event => set("options", event.target.value)}
        aria-invalid={!!error("options")} aria-describedby={described("options", true)} />
    </Field>}
    {(draft.kind === "multi" || draft.kind === "person") && <Field label="Paling banyak dipilih (boleh kosong)" name={field("maxChoices")} error={error("maxChoices")} hint="Kosongkan bila tidak dibatasi.">
      <input id={field("maxChoices")} className="input" inputMode="numeric" value={draft.maxChoices} onChange={event => set("maxChoices", event.target.value.replace(/[^\d]/g, ""))}
        aria-invalid={!!error("maxChoices")} aria-describedby={described("maxChoices", true)} style={{ maxWidth: "10rem" }} />
    </Field>}
    {draft.kind === "matrix" && <div className={styles.editorGrid}>
      <Field label="Baris" name={field("matrixRows")} error={error("matrixRows")} hint="Satu baris per baris teks, misalnya hal yang dinilai.">
        <textarea id={field("matrixRows")} className="textarea" rows={5} value={draft.matrixRows} onChange={event => set("matrixRows", event.target.value)}
          aria-invalid={!!error("matrixRows")} aria-describedby={described("matrixRows", true)} />
      </Field>
      <Field label="Skala" name={field("scale")} error={error("scale")} hint="Pilihan yang sama untuk setiap baris, satu per baris.">
        <textarea id={field("scale")} className="textarea" rows={5} value={draft.scale} onChange={event => set("scale", event.target.value)}
          aria-invalid={!!error("scale")} aria-describedby={described("scale", true)} />
      </Field>
    </div>}
    {(draft.kind === "text" || draft.kind === "long") && <Field label="Contoh isian (placeholder)" name={field("placeholder")} error={error("placeholder")}>
      <input id={field("placeholder")} className="input" value={draft.placeholder} maxLength={170} onChange={event => set("placeholder", event.target.value)}
        aria-invalid={!!error("placeholder")} aria-describedby={described("placeholder")} />
    </Field>}

    <div className={styles.editorGrid}>
      <Field label="Catatan di bawah pertanyaan" name={field("note")} error={error("note")}>
        <textarea id={field("note")} className="textarea" rows={2} value={draft.note} onChange={event => set("note", event.target.value)}
          aria-invalid={!!error("note")} aria-describedby={described("note")} style={{ minHeight: 72 }} />
      </Field>
      <Field label="Reaksi setelah menjawab" name={field("react")} error={error("react")} hint="Kalimat kecil yang muncul setelah peserta menjawab.">
        <textarea id={field("react")} className="textarea" rows={2} value={draft.react} onChange={event => set("react", event.target.value)}
          aria-invalid={!!error("react")} aria-describedby={described("react", true)} style={{ minHeight: 72 }} />
      </Field>
    </div>

    <fieldset className={styles.fieldset} aria-describedby={error("showIf") ? `${field("showIf")}-error` : undefined}>
      <legend>Syarat tampil</legend>
      <Field label="Tampil bila pertanyaan ini dijawab" name={field("showIfQuestion")}>
        <select id={field("showIfQuestion")} className="select" value={draft.showIfQuestion} onChange={event => set("showIfQuestion", event.target.value)}>
          <option value="">Selalu tampil</option>
          {draft.showIfQuestion && !target && <option value={draft.showIfQuestion}>Pertanyaan {draft.showIfQuestion} (tidak ada lagi)</option>}
          {targets.map(item => <option key={item.id} value={item.key}>{item.key}. {item.prompt.length > 70 ? `${item.prompt.slice(0, 70)}…` : item.prompt}</option>)}
        </select>
      </Field>
      {draft.showIfQuestion && <>
        <div className={styles.choiceList} role="radiogroup" aria-label="Cara mencocokkan">
          <label className={styles.choice}><input type="radio" name={field("mode")} checked={draft.showIfMode === "any"} onChange={() => set("showIfMode", "any")} />Bila jawabannya salah satu dari</label>
          <label className={styles.choice}><input type="radio" name={field("mode")} checked={draft.showIfMode === "not"} onChange={() => set("showIfMode", "not")} />Kecuali bila jawabannya</label>
        </div>
        {targetOptions.length
          ? <div className={styles.choiceList} role="group" aria-label="Jawaban acuan">{targetOptions.map(option => <label key={option} className={styles.choice}>
            <input type="checkbox" checked={draft.showIfOptions.includes(option)}
              onChange={event => set("showIfOptions", event.target.checked ? [...draft.showIfOptions, option] : draft.showIfOptions.filter(item => item !== option))} />
            {option}
          </label>)}</div>
          : <p className={styles.muted}>Pertanyaan itu belum punya pilihan.</p>}
      </>}
      {error("showIf") && <p id={`${field("showIf")}-error`} className="field-error">{error("showIf")}</p>}
    </fieldset>

    {hasErrors && <Notice tone="error">Periksa isian yang ditandai.</Notice>}
    <div className={styles.actions}>
      <Button type="submit" disabled={saving}>{saving ? "Menyimpan…" : questionKey ? "Simpan pertanyaan" : "Tambah pertanyaan"}</Button>
      <Button type="button" variant="secondary" disabled={saving} onClick={onCancel}>Batal</Button>
      {onDelete && <Button type="button" variant="quiet" disabled={saving} onClick={onDelete}>{answered ? "Hapus (atau sembunyikan bila sudah dijawab)" : "Hapus pertanyaan"}</Button>}
    </div>
  </form>;
}
