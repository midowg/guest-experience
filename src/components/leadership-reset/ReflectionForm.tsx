"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, Check, Clock, Copy, Download, Lock, PencilLine, Send } from "lucide-react";
import { errorMessage } from "@/components/admin/shared/api";
import {
  answerFileName, answerText, daysUntil, formState, looksLikeKey, MAX_ANSWER, newKey, questionsFor, TARGET_STATUSES, targetLabels,
  wibDateLabel, wibInstantLabel, type LrContent, type OwnAnswer, type TargetStatus,
} from "@/lib/leadership-reset/form";
import { saveBlob, store, type FormApi } from "./api";
import css from "./reflection.module.css";

/*
 * The leader's form (19 Nov 2026, simplified the same day for directors and senior leaders): one
 * page, large type, high contrast. On a phone everything stacks; on a desktop the training's
 * details sit on the left and the form on the right. Pick the target, and only the questions that
 * fit it appear. The draft stays on this device; after sending, the answer can be copied,
 * downloaded, or changed while the form is open. No sign-in: a key kept on this device finds it.
 */

type Draft = { name: string; team: string; targetStatus: TargetStatus | null; answers: Record<string, string> };
const EMPTY: Draft = { name: "", team: "", targetStatus: null, answers: {} };
const DRAFT_KEY = "lr:draft";
const OWN_KEY = "lr:key";

function readDraft(): Draft | null {
  const raw = store.get(DRAFT_KEY);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<Draft>;
    return {
      name: typeof value.name === "string" ? value.name : "",
      team: typeof value.team === "string" ? value.team : "",
      targetStatus: TARGET_STATUSES.includes(value.targetStatus as TargetStatus) ? value.targetStatus as TargetStatus : null,
      answers: value.answers && typeof value.answers === "object" ? Object.fromEntries(Object.entries(value.answers).filter(([, text]) => typeof text === "string")) as Record<string, string> : {},
    };
  } catch { return null; }
}
const fromAnswer = (answer: OwnAnswer): Draft => ({ name: answer.name, team: answer.team, targetStatus: answer.targetStatus, answers: Object.fromEntries(answer.answers.map(item => [item.id, item.text])) });

function countdown(date: string | null, now: string): string | null {
  if (!date) return null;
  const days = daysUntil(date, new Date(now));
  return days < 0 ? null : days === 0 ? "hari ini" : days === 1 ? "besok" : `${days} hari lagi`;
}

export function ReflectionForm({ content, isOpen, now, api, preview = false }: { content: LrContent; isOpen: boolean; now: string; api: FormApi; preview?: boolean }) {
  const state = formState(isOpen, content.deadline, new Date(now));
  const [phase, setPhase] = useState<"checking" | "form" | "done">("checking");
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [saved, setSaved] = useState<OwnAnswer | null>(null);
  const [key, setKey] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const top = useRef<HTMLDivElement>(null);

  const questions = useMemo(() => draft.targetStatus ? questionsFor(draft.targetStatus, content.questions) : [], [draft.targetStatus, content.questions]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await Promise.resolve();
      const fromHash = /(?:^#|&)jawaban=([A-Za-z0-9_-]{32,128})/.exec(window.location.hash)?.[1] ?? null;
      if (fromHash) {
        store.set(OWN_KEY, fromHash);
        window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}`);
      }
      const known = fromHash ?? store.get(OWN_KEY);
      let answer: OwnAnswer | null = null;
      if (known && looksLikeKey(known)) { try { answer = await api.readOwn(known); } catch { /* shown as a fresh form */ } }
      if (cancelled) return;
      if (known && looksLikeKey(known)) setKey(known);
      if (answer) { setSaved(answer); setDraft(fromAnswer(answer)); setPhase("done"); return; }
      setDraft(readDraft() ?? EMPTY);
      setPhase("form");
    })();
    return () => { cancelled = true; };
  }, [api]);

  useEffect(() => { if (phase === "form" && draft !== EMPTY) store.set(DRAFT_KEY, JSON.stringify(draft)); }, [draft, phase]);

  const set = (patch: Partial<Draft>) => setDraft(current => ({ ...current, ...patch }));
  const missing = {
    name: draft.name.trim().length < 2,
    team: draft.team.trim().length < 2,
    status: !draft.targetStatus,
    answers: questions.filter(question => question.required && !draft.answers[question.id]?.trim()).map(question => question.id),
  };
  const ready = !missing.name && !missing.team && !missing.status && missing.answers.length === 0;

  async function submit() {
    setTried(true);
    if (!ready || !draft.targetStatus) { setError("Masih ada isian yang belum lengkap. Lihat tanda merah di atas."); return; }
    const own = key ?? newKey();
    if (!key) { store.set(OWN_KEY, own); setKey(own); }
    setSending(true); setError(null);
    try {
      const result = await api.save({ key: own, name: draft.name, team: draft.team, targetStatus: draft.targetStatus, answers: questions.map(question => ({ id: question.id, text: draft.answers[question.id] ?? "" })) });
      setSaved(result); store.remove(DRAFT_KEY); setPhase("done");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (failure) { setError(errorMessage(failure)); }
    finally { setSending(false); }
  }

  const left = countdown(content.trainingDate, now);
  const aside = <aside className={css.aside}>
    <p className={css.kicker}>Refleksi sebelum training</p>
    <h1 className={css.title}>{content.title}</h1>
    {content.tagline && <p className={css.tagline}>“{content.tagline}”</p>}
    <p className={css.coach}>bersama <strong>{content.coach}</strong></p>
    <ul className={css.facts}>
      {content.trainingDate && <li><CalendarDays size={22} aria-hidden="true" /><span>{wibDateLabel(content.trainingDate)}{left && <em> · {left}</em>}</span></li>}
      {content.deadline && <li><Clock size={22} aria-hidden="true" /><span>Isi sebelum {wibInstantLabel(content.deadline)}</span></li>}
      {content.privacy && <li><Lock size={22} aria-hidden="true" /><span>{content.privacy}</span></li>}
    </ul>
  </aside>;

  return <main className={css.page}>
    {preview && <p className={css.previewBanner}>Pratinjau: jawaban tidak dikirim ke database.</p>}
    <div className={css.layout} ref={top}>
      {aside}
      <div className={css.main}>
        {phase === "checking" && <div className={css.card} aria-busy="true"><p className={css.muted}>Memuat…</p></div>}

        {phase === "done" && saved && <Done content={content} saved={saved} canEdit={state === "open"} onEdit={() => setPhase("form")} />}

        {phase === "form" && state !== "open" && <div className={css.card} role="status">
          <h2 className={css.sectionTitle}>{state === "past" ? "Batas waktu pengisian sudah lewat" : "Form belum dibuka"}</h2>
          <p className={css.muted}>{state === "past" ? "Terima kasih atas perhatian Bapak/Ibu." : "Silakan coba lagi nanti, atau hubungi panitia."}</p>
        </div>}

        {phase === "form" && state === "open" && <form className={css.card} noValidate onSubmit={event => { event.preventDefault(); void submit(); }}>
          {content.intro && <p className={css.intro}>{content.intro}</p>}

          <div className={css.block}>
            <h2 className={css.sectionTitle}><span className={css.num}>1</span> Data diri</h2>
            <label className={css.field} data-error={tried && missing.name || undefined}>
              <span>Nama lengkap</span>
              <input value={draft.name} onChange={event => set({ name: event.target.value })} autoComplete="name" maxLength={120} />
              {tried && missing.name && <small>Mohon isi nama.</small>}
            </label>
            <label className={css.field} data-error={tried && missing.team || undefined}>
              <span>Tim / divisi</span>
              <input value={draft.team} onChange={event => set({ team: event.target.value })} maxLength={120} />
              {tried && missing.team && <small>Mohon isi tim atau divisi.</small>}
            </label>
          </div>

          <fieldset className={css.block} data-error={tried && missing.status || undefined}>
            <legend className={css.sectionTitle}><span className={css.num}>2</span> {content.statusQuestion}</legend>
            <div className={css.choices}>
              {TARGET_STATUSES.map(status => <label key={status} className={css.choice} data-status={status}>
                <input type="radio" name="target" checked={draft.targetStatus === status} onChange={() => set({ targetStatus: status })} />
                <span className={css.radio} aria-hidden="true"><Check size={18} /></span>
                <span>{targetLabels[status]}</span>
              </label>)}
            </div>
            {tried && missing.status && <small className={css.errorText}>Mohon pilih salah satu.</small>}
          </fieldset>

          {questions.map((question, index) => {
            const empty = tried && missing.answers.includes(question.id);
            return <label key={question.id} className={`${css.block} ${css.field}`} data-error={empty || undefined}>
              <span className={css.sectionTitle}><span className={css.num}>{3 + index}</span> {question.label}{!question.required && <em className={css.optional}> (boleh dikosongkan)</em>}</span>
              {question.hint && <span className={css.hint}>{question.hint}</span>}
              <textarea rows={6} maxLength={MAX_ANSWER} value={draft.answers[question.id] ?? ""} onChange={event => set({ answers: { ...draft.answers, [question.id]: event.target.value } })} />
              {empty && <small>Mohon diisi.</small>}
            </label>;
          })}
          {!draft.targetStatus && <p className={css.muted}>Pertanyaan refleksi muncul setelah Bapak/Ibu memilih capaian target.</p>}

          {error && <p className={css.error} role="alert">{error}</p>}
          <button type="submit" className={css.submit} disabled={sending}>{sending ? "Mengirim…" : saved ? "Simpan perubahan" : "Kirim jawaban"} <Send size={22} aria-hidden="true" /></button>
          <p className={css.small}>Jawaban otomatis tersimpan di perangkat ini sampai dikirim.</p>
        </form>}
      </div>
    </div>
  </main>;
}

function Done({ content, saved, canEdit, onEdit }: { content: LrContent; saved: OwnAnswer; canEdit: boolean; onEdit: () => void }) {
  const [copied, setCopied] = useState(false);
  const text = answerText(content, saved);
  return <div className={css.card}>
    <div className={css.doneHead}>
      <span className={css.doneIcon}><Check size={32} aria-hidden="true" /></span>
      <div>
        <h2 className={css.sectionTitle}>Terima kasih, jawaban sudah terkirim</h2>
        <p className={css.muted}>Diperbarui {wibInstantLabel(saved.updatedAt)}. {content.privacy}</p>
      </div>
    </div>
    <div className={css.doneButtons}>
      <button type="button" className={css.secondary} onClick={async () => { try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2500); } catch { /* not copied */ } }}><Copy size={20} aria-hidden="true" /> {copied ? "Tersalin" : "Salin jawaban"}</button>
      <button type="button" className={css.secondary} onClick={() => saveBlob(new Blob([text], { type: "text/plain;charset=utf-8" }), answerFileName(saved))}><Download size={20} aria-hidden="true" /> Unduh</button>
      {canEdit && <button type="button" className={css.secondary} onClick={onEdit}><PencilLine size={20} aria-hidden="true" /> Ubah jawaban</button>}
    </div>
    <div className={css.answers}>
      <p><strong>{saved.name}</strong> · {saved.team} · {targetLabels[saved.targetStatus]}</p>
      {saved.answers.map(answer => <div key={answer.id}><h3>{answer.label}</h3><p>{answer.text}</p></div>)}
      {content.closing && <p className={css.closing}>{content.closing}</p>}
    </div>
  </div>;
}
