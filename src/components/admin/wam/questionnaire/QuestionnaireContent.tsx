"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowDown, ArrowUp, ChevronRight, Eye, EyeOff, GitBranch, Plus } from "lucide-react";
import { Button, Field, Notice } from "@/components/ui";
import { useConfirm } from "@/components/pra-wam/ConfirmDialog";
import { AdminApiError, adminRequest, errorMessage } from "@/components/admin/shared/api";
import type { QQuestion, QSection, Visibility } from "@/lib/pra-wam/questionnaire";
import { praWamQuestionnaireApi } from "@/lib/routes";
import type { AdminQuestionnaire } from "@/lib/server/pra-wam/questionnaire-admin";
import { QuestionEditor, newDraft, toDraft, type FieldErrors, type QuestionDraft, type QuestionPayload, fromDraft } from "./QuestionEditor";
import { QuestionPreview } from "./QuestionPreview";
import { kindLabels, visibilityShort } from "./labels";
import styles from "./questionnaire.module.css";

type Message = { tone: "success" | "error" | "warning"; text: string } | null;
type SectionDraft = { title: string; short: string; hello: string; intro: string; tease: string; anonymous: boolean };

const pillClass: Record<Visibility, string> = {
  rekan: styles.pillRekan, fasil: styles.pillFasil, hr: styles.pillHr, hronly: styles.pillHronly, pilih: styles.pillPilih, anon: styles.pillAnon,
};
/** The server's field errors by their first path part ("options.2" is "options"). */
const byField = (errors: Record<string, string[]> | undefined): FieldErrors => {
  const result: FieldErrors = {};
  for (const [path, list] of Object.entries(errors ?? {})) (result[path.split(".")[0]] ??= []).push(...list);
  return result;
};
const sectionDraft = (section?: QSection): SectionDraft => ({
  title: section?.title ?? "", short: section?.short ?? "", hello: section?.hello ?? "", intro: section?.intro ?? "", tease: section?.tease ?? "", anonymous: section?.anonymous ?? false,
});
const moved = <T,>(items: T[], index: number, by: -1 | 1) => { const next = [...items]; [next[index], next[index + by]] = [next[index + by], next[index]]; return next; };

/**
 * Admin WAM → Kuesioner → Konten: the sections (collapsible, in order) and their questions, each
 * row showing its kind, who reads it, and whether it is required, hidden or conditional. A row
 * opens its editor in place; the preview beside the list follows the open question as it is typed.
 * Up and down buttons reorder (focus stays on the moved item); moving to another section is in
 * the editor. Deleting something already answered hides it instead (the server decides).
 */
export function QuestionnaireContent({ initial }: { initial: AdminQuestionnaire }) {
  const [data, setData] = useState(initial);
  const [open, setOpen] = useState<Set<string>>(() => new Set(initial.sections.slice(0, 1).map(section => section.id)));
  const [selected, setSelected] = useState<string | null>(null);
  /** The question whose editor is open: its id, or "new:<sectionId>". */
  const [editing, setEditing] = useState<string | null>(null);
  const [preview, setPreview] = useState<QuestionDraft | null>(null);
  /** The section whose own editor is open: its id, or "new". */
  const [sectionEditing, setSectionEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<Message>(null);
  const [confirm, confirmDialog] = useConfirm();
  const focusNext = useRef<string | null>(null);

  const sections = [...data.sections].sort((a, b) => a.sort - b.sort);
  const questionsOf = (sectionId: string) => data.questions.filter(question => question.sectionId === sectionId).sort((a, b) => a.sort - b.sort);

  useEffect(() => {
    if (!focusNext.current) return;
    const [target, fallback] = focusNext.current.split("|");
    focusNext.current = null;
    const element = document.getElementById(target) as HTMLButtonElement | null;
    (element && !element.disabled ? element : document.getElementById(fallback))?.focus();
  }, [data]);

  /** One request; the answer is the whole content again. Field errors are handed back to the caller. */
  async function run(key: string, url: string, init: RequestInit): Promise<{ ok: true; data: AdminQuestionnaire & { createdId?: string } } | { ok: false; fieldErrors?: FieldErrors }> {
    setBusy(key); setMessage(null);
    try {
      const result = await adminRequest<AdminQuestionnaire & { createdId?: string }>(url, init);
      if (!result.data) throw new AdminApiError("Respons server tidak berisi kuesioner. Muat ulang halaman.");
      setData(result.data);
      setMessage({ tone: result.message.includes("disembunyikan") ? "warning" : "success", text: result.message });
      return { ok: true, data: result.data };
    } catch (problem) {
      setMessage({ tone: "error", text: errorMessage(problem) });
      return { ok: false, fieldErrors: problem instanceof AdminApiError ? byField(problem.fieldErrors) : undefined };
    } finally { setBusy(null); }
  }
  const json = (method: string, body?: unknown): RequestInit => ({ method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

  const toggleOpen = (id: string) => setOpen(now => { const next = new Set(now); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const select = (question: QQuestion) => {
    if (editing === question.id) { setEditing(null); setPreview(null); return; }
    setSelected(question.id); setEditing(question.id); setPreview(toDraft(question));
  };

  async function moveSection(index: number, by: -1 | 1) {
    const ids = moved(sections.map(section => section.id), index, by);
    focusNext.current = `s-${ids[index + by]}-${by < 0 ? "up" : "down"}|s-${ids[index + by]}-${by < 0 ? "down" : "up"}`;
    await run(`order-s`, praWamQuestionnaireApi.order, json("PUT", { sections: ids }));
  }
  async function moveQuestion(sectionId: string, index: number, by: -1 | 1) {
    const ids = moved(questionsOf(sectionId).map(question => question.id), index, by);
    focusNext.current = `q-${ids[index + by]}-${by < 0 ? "up" : "down"}|q-${ids[index + by]}-${by < 0 ? "down" : "up"}`;
    await run(`order-${sectionId}`, praWamQuestionnaireApi.order, json("PUT", { sectionId, questions: ids }));
  }

  async function saveQuestion(id: string | null, payload: QuestionPayload): Promise<FieldErrors | null> {
    const result = id
      ? await run(`q-${id}`, praWamQuestionnaireApi.question(id), json("PATCH", payload))
      : await run("q-new", praWamQuestionnaireApi.questions, json("POST", payload));
    if (!result.ok) return result.fieldErrors ?? null;
    const savedId = id ?? result.data.createdId ?? null;
    setEditing(null); setPreview(null); setSelected(savedId);
    setOpen(now => new Set(now).add(payload.sectionId));
    return null;
  }
  async function toggleQuestionHidden(question: QQuestion) {
    await run(`q-${question.id}`, praWamQuestionnaireApi.question(question.id), json("PATCH", { hidden: !question.hidden }));
  }
  async function deleteQuestion(question: QQuestion) {
    const ok = await confirm({
      title: "Hapus pertanyaan ini?",
      body: data.answered
        ? "Kalau pertanyaan ini sudah punya jawaban, ia hanya disembunyikan dan jawabannya tetap tersimpan. Kalau belum, ia dihapus permanen."
        : "Pertanyaan dihapus permanen. Belum ada jawaban yang masuk.",
      confirmLabel: "Hapus", danger: true,
    });
    if (!ok) return;
    const result = await run(`q-${question.id}`, praWamQuestionnaireApi.question(question.id), json("DELETE"));
    if (result.ok) { setEditing(null); setPreview(null); if (!result.data.questions.some(item => item.id === question.id)) setSelected(null); }
  }

  async function saveSection(id: string | null, draft: SectionDraft): Promise<FieldErrors | null> {
    const result = id
      ? await run(`s-${id}`, praWamQuestionnaireApi.section(id), json("PATCH", draft))
      : await run("s-new", praWamQuestionnaireApi.sections, json("POST", draft));
    if (!result.ok) return result.fieldErrors ?? null;
    setSectionEditing(null);
    if (!id) { const added = [...result.data.sections].sort((a, b) => b.sort - a.sort)[0]; if (added) setOpen(now => new Set(now).add(added.id)); }
    return null;
  }
  async function toggleSectionHidden(section: QSection) {
    await run(`s-${section.id}`, praWamQuestionnaireApi.section(section.id), json("PATCH", { hidden: !section.hidden }));
  }
  async function deleteSection(section: QSection) {
    const count = questionsOf(section.id).length;
    const ok = await confirm({
      title: `Hapus bagian "${section.title}"?`,
      body: `${count ? `Bagian ini berisi ${count} pertanyaan yang ikut terhapus. ` : ""}Kalau sudah ada jawaban di bagian ini, bagian hanya disembunyikan dan jawabannya tetap tersimpan.`,
      confirmLabel: "Hapus bagian", danger: true,
    });
    if (!ok) return;
    const result = await run(`s-${section.id}`, praWamQuestionnaireApi.section(section.id), json("DELETE"));
    if (result.ok) setSectionEditing(null);
  }

  // The preview: the open editor's draft as typed, else the selected question.
  const shownQuestion = data.questions.find(question => question.id === selected) ?? null;
  const previewed = preview ? { ...fromDraft(preview), key: shownQuestion?.key ?? "baru" } : shownQuestion;
  const previewSection = data.sections.find(section => section.id === (preview?.sectionId ?? shownQuestion?.sectionId)) ?? null;
  const locked = busy !== null;

  return <div className="stack">
    <div className={styles.head}>
      <div>
        <h2>Konten</h2>
        <p className={styles.muted}>{sections.length} bagian, {data.questions.length} pertanyaan. Ketuk pertanyaan untuk mengubah; pratinjau mengikuti isian.</p>
      </div>
      <Button type="button" variant="secondary" disabled={locked} onClick={() => setSectionEditing("new")}><Plus size={18} aria-hidden /> Tambah bagian</Button>
    </div>
    {data.answered && <Notice tone="info">Sudah ada jawaban yang masuk. Mengubah teks tidak mengubah jawaban lama; menghapus pertanyaan atau bagian yang sudah dijawab hanya menyembunyikannya.</Notice>}
    <div aria-live="polite">{message && <Notice tone={message.tone} role={message.tone === "error" ? "alert" : "status"}>{message.text}</Notice>}</div>

    <div className={styles.layout}>
      <div className="stack">
        {sectionEditing === "new" && <div className={styles.section}>
          <SectionEditor initial={sectionDraft()} isNew onSave={draft => saveSection(null, draft)} onCancel={() => setSectionEditing(null)} />
        </div>}
        <ol className={styles.sections}>
          {sections.map((section, index) => {
            const questions = questionsOf(section.id);
            const isOpen = open.has(section.id);
            const bodyId = `s-${section.id}-body`;
            return <li key={section.id} className={`${styles.section} ${section.hidden ? styles.sectionHidden : ""}`}>
              <div className={styles.sectionHead}>
                <button type="button" className={styles.toggleButton} aria-expanded={isOpen} aria-controls={bodyId} onClick={() => toggleOpen(section.id)}>
                  <ChevronRight size={20} aria-hidden />
                  <span className={styles.toggleText}>
                    <strong>{index + 1}. {section.title}</strong>
                    <small>
                      {questions.length} pertanyaan
                      {section.anonymous && " · Anonim"}
                      {section.hidden && " · Disembunyikan"}
                    </small>
                  </span>
                </button>
                <span className={styles.order}>
                  <button type="button" id={`s-${section.id}-up`} className={styles.iconButton} disabled={locked || index === 0} onClick={() => void moveSection(index, -1)} aria-label={`Naikkan bagian ${section.title}`}><ArrowUp size={18} aria-hidden /></button>
                  <button type="button" id={`s-${section.id}-down`} className={styles.iconButton} disabled={locked || index === sections.length - 1} onClick={() => void moveSection(index, 1)} aria-label={`Turunkan bagian ${section.title}`}><ArrowDown size={18} aria-hidden /></button>
                </span>
              </div>
              {isOpen && <div id={bodyId} className={styles.sectionBody}>
                {sectionEditing === section.id
                  ? <SectionEditor initial={sectionDraft(section)} onSave={draft => saveSection(section.id, draft)} onCancel={() => setSectionEditing(null)} onDelete={() => void deleteSection(section)} />
                  : <div className={styles.actions}>
                    <Button type="button" variant="secondary" disabled={locked} onClick={() => setSectionEditing(section.id)}>Ubah bagian</Button>
                    <Button type="button" variant="quiet" disabled={locked} onClick={() => void toggleSectionHidden(section)}>
                      {section.hidden ? <><Eye size={18} aria-hidden /> Tampilkan bagian</> : <><EyeOff size={18} aria-hidden /> Sembunyikan bagian</>}
                    </Button>
                  </div>}
                {section.hello && <p className={styles.muted}><strong>{section.hello}</strong> {section.intro}</p>}
                <ol className={styles.questions}>
                  {questions.map((question, position) => {
                    const isEditing = editing === question.id;
                    return <li key={question.id} className={`${styles.question} ${selected === question.id ? styles.questionSelected : ""} ${question.hidden ? styles.questionHidden : ""}`}>
                      <div className={styles.questionRow}>
                        <button type="button" className={styles.questionOpen} aria-expanded={isEditing} onClick={() => select(question)} aria-label={`Pertanyaan ${question.key}: ${question.prompt}. ${isEditing ? "Tutup editor" : "Ubah"}`}>
                          <span className={styles.questionNumber}>{question.key}</span>
                          <span className={styles.questionPrompt}>{question.prompt}</span>
                          <span className={styles.questionMeta}>
                            <span>{kindLabels[question.kind]}</span>
                            <span className={`${styles.pill} ${pillClass[question.visibility]}`}>{visibilityShort[question.visibility]}</span>
                            {question.required && <span className={`${styles.pill} ${styles.pillRequired}`}>Wajib</span>}
                            {question.hidden && <span className={`${styles.pill} ${styles.pillHidden}`}><EyeOff size={12} aria-hidden />Disembunyikan</span>}
                            {question.showIf && <span className={styles.pill}><GitBranch size={12} aria-hidden />Bersyarat ({question.showIf.question})</span>}
                          </span>
                        </button>
                        <span className={styles.order}>
                          <button type="button" id={`q-${question.id}-up`} className={styles.iconButton} disabled={locked || position === 0} onClick={() => void moveQuestion(section.id, position, -1)} aria-label={`Naikkan pertanyaan ${question.key}`}><ArrowUp size={18} aria-hidden /></button>
                          <button type="button" id={`q-${question.id}-down`} className={styles.iconButton} disabled={locked || position === questions.length - 1} onClick={() => void moveQuestion(section.id, position, 1)} aria-label={`Turunkan pertanyaan ${question.key}`}><ArrowDown size={18} aria-hidden /></button>
                          <button type="button" className={styles.iconButton} disabled={locked} onClick={() => void toggleQuestionHidden(question)} aria-label={question.hidden ? `Tampilkan pertanyaan ${question.key}` : `Sembunyikan pertanyaan ${question.key}`}>
                            {question.hidden ? <Eye size={18} aria-hidden /> : <EyeOff size={18} aria-hidden />}
                          </button>
                        </span>
                      </div>
                      {isEditing && <QuestionEditor key={question.id} initial={toDraft(question)} questionKey={question.key} sections={sections} questions={data.questions}
                        departments={data.departments} answered={data.answered} onDraft={setPreview}
                        onSave={payload => saveQuestion(question.id, payload)} onCancel={() => { setEditing(null); setPreview(null); }} onDelete={() => void deleteQuestion(question)} />}
                    </li>;
                  })}
                </ol>
                {!questions.length && <p className={styles.muted}>Belum ada pertanyaan di bagian ini.</p>}
                {editing === `new:${section.id}`
                  ? <div className={styles.question}>
                    <QuestionEditor key={`new-${section.id}`} initial={newDraft(section)} questionKey={null} sections={sections} questions={data.questions}
                      departments={data.departments} answered={false} onDraft={setPreview}
                      onSave={payload => saveQuestion(null, payload)} onCancel={() => { setEditing(null); setPreview(null); }} />
                  </div>
                  : <div className={styles.addRow}>
                    <Button type="button" variant="secondary" disabled={locked} onClick={() => { setEditing(`new:${section.id}`); setSelected(null); setPreview(newDraft(section)); }}>
                      <Plus size={18} aria-hidden /> Tambah pertanyaan
                    </Button>
                  </div>}
              </div>}
            </li>;
          })}
        </ol>
        {!sections.length && <p className={styles.muted}>Belum ada bagian. Tambahkan bagian pertama.</p>}
      </div>

      <aside className={styles.previewPane} aria-label="Pratinjau">
        <p><strong>Pratinjau</strong> <small className={styles.muted}>(seperti di HP peserta)</small></p>
        <QuestionPreview question={previewed} section={previewSection} departments={data.departments} />
      </aside>
    </div>
    {confirmDialog}
  </div>;
}

/** A section's own texts, and whether its answers are kept without names. */
function SectionEditor({ initial, isNew = false, onSave, onCancel, onDelete }: {
  initial: SectionDraft; isNew?: boolean; onSave: (draft: SectionDraft) => Promise<FieldErrors | null>; onCancel: () => void; onDelete?: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);
  const prefix = isNew ? "section-new" : "section-edit";
  const error = (key: string) => errors[key]?.[0];
  const set = (key: keyof SectionDraft, value: string | boolean) => { setDraft({ ...draft, [key]: value }); if (errors[key]?.length) setErrors({ ...errors, [key]: [] }); };
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (draft.title.trim().length < 2) { setErrors({ title: ["Tulis judul bagian, minimal 2 karakter."] }); return; }
    setSaving(true);
    try { const fromServer = await onSave(draft); if (fromServer) setErrors(fromServer); } finally { setSaving(false); }
  }
  const input = (key: "title" | "short" | "hello" | "tease", label: string, max: number, hint?: string) =>
    <Field label={label} name={`${prefix}-${key}`} error={error(key)} hint={hint}>
      <input id={`${prefix}-${key}`} className="input" value={draft[key]} maxLength={max + 10} onChange={event => set(key, event.target.value)} aria-invalid={!!error(key)}
        aria-describedby={[hint ? `${prefix}-${key}-hint` : "", error(key) ? `${prefix}-${key}-error` : ""].filter(Boolean).join(" ") || undefined} />
    </Field>;
  return <form className={styles.editor} noValidate onSubmit={submit} aria-label={isNew ? "Bagian baru" : "Ubah bagian"}>
    <div className={styles.editorGrid}>
      {input("title", "Judul bagian", 80)}
      {input("short", "Nama singkat (stiker progres)", 30)}
    </div>
    {input("hello", "Sapaan", 120, "Satu kalimat pembuka, misalnya \"Mulai dari yang gampang.\"")}
    <Field label="Pengantar" name={`${prefix}-intro`} error={error("intro")}>
      <textarea id={`${prefix}-intro`} className="textarea" rows={3} value={draft.intro} onChange={event => set("intro", event.target.value)} aria-invalid={!!error("intro")} />
    </Field>
    {input("tease", "Teks penutup", 160, "Muncul di akhir bagian, misalnya \"Habis ini: …\".")}
    <label className={styles.check}><input type="checkbox" checked={draft.anonymous} onChange={event => set("anonymous", event.target.checked)} />Bagian anonim (jawaban disimpan tanpa nama)</label>
    {error("anonymous") && <p className="field-error">{error("anonymous")}</p>}
    <div className={styles.actions}>
      <Button type="submit" disabled={saving}>{saving ? "Menyimpan…" : isNew ? "Tambah bagian" : "Simpan bagian"}</Button>
      <Button type="button" variant="secondary" disabled={saving} onClick={onCancel}>Batal</Button>
      {onDelete && <Button type="button" variant="quiet" disabled={saving} onClick={onDelete}>Hapus bagian</Button>}
    </div>
  </form>;
}
