"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { ArrowLeft, Check, Clock, CloudOff, Database, Eye, Hand, Info, Lock, Pause, Send, Sparkles, Users, VenetianMask } from "lucide-react";
import {
  answered, complete, progressOf, visibilityLabels,
  type AnswerValue, type Answers, type QForm, type QQuestion, type QSection, type Visibility,
} from "@/lib/pra-wam/questionnaire";
import { praWamApi, praWamPath } from "@/lib/routes";
import type { CardView } from "@/lib/server/pra-wam/cards";
import { errorText, praWamRequest } from "../api";
import { CardReveal } from "./CardReveal";
import { QuestionField, type Person } from "./fields";
import { deadlineLabel, QuestionnaireApp, Top } from "./Frame";
import { anonymousDraftKey, forget, pendingKey, readAnswers, writeAnswers } from "./local";
import { minutesLeft, reactionFor, resumeIndex, sectionsDone, stepsOf, type Step } from "./steps";
import { useAutosave } from "./useAutosave";
import styles from "./questionnaire.module.css";

export type QuestionnaireProps = {
  form: Pick<QForm, "id" | "name" | "intro" | "minutes" | "editUntil">;
  sections: QSection[]; questions: QQuestion[];
  departments: string[]; people: Person[];
  initial: { answers: Answers; anonymousSent: boolean };
  nickname: string; home: string;
  /** A draft tried by Admin WAM before it opens: marked, and its answers are test data. */
  preview?: boolean;
  /** My character card, if it is drawn already; else it is drawn when I reach the end. */
  card?: CardView | null;
  /** Whether I have a profile photo now (using the card as one asks first). */
  hasPhoto?: boolean;
  /** Answers Data karyawan already knows (name, department, position, phone, gender), shown filled in and saved when I move on. */
  prefill?: Answers;
};

const visibilityIcons: Record<Visibility, typeof Eye> = { rekan: Eye, fasil: Users, hr: Lock, hronly: Lock, pilih: Hand, anon: VenetianMask };
/** Intro card colours, one per section in turn (the mockup's sticker sheet). */
const introFills = ["--c-sky-2", "--c-yellow", "--c-green", "--c-ice", "--c-orange", "--c-sky-2"];
const PEEL_MS = 260;
const NO_PREFILL: Answers = {};
const TYPING_MS = 800;

const reducedMotion = () => typeof window === "undefined" || typeof window.matchMedia !== "function" || window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * The questionnaire, one card at a time (mockup "Cerita Kita"): a welcome card, then per section
 * an intro card and one card per question, then "Selesai". Named answers save themselves as the
 * person goes; the anonymous section stays on this device until it is sent once, without a name.
 */
export function Questionnaire({ form, sections, questions, departments, people, initial, nickname, home, preview, card: drawnCard = null, hasPhoto = false, prefill = NO_PREFILL }: QuestionnaireProps) {
  const content = useMemo(() => ({ sections, questions }), [sections, questions]);
  const anonymousIds = useMemo(() => new Set(sections.filter(section => section.anonymous).map(section => section.id)), [sections]);
  const names = useMemo(() => new Map(people.map(person => [person.id, person.name])), [people]);

  const [answers, setAnswers] = useState<Answers>(initial.answers);
  const [draft, setDraft] = useState<Answers>({});
  const [anonymousSent, setAnonymousSent] = useState(initial.anonymousSent);
  const [stepId, setStepId] = useState("welcome");
  const [lastIndex, setLastIndex] = useState(0);
  const [entering, setEntering] = useState<"in" | "inBack">("in");
  const [leaving, setLeaving] = useState<"out" | "outBack" | null>(null);
  const [nudge, setNudge] = useState("");
  const [problems, setProblems] = useState<Record<string, string>>({});
  const [reaction, setReaction] = useState<{ text: string; fading: boolean } | null>(null);
  const [popped, setPopped] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sendProblem, setSendProblem] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const moved = useRef(false);
  const reactionTimers = useRef<number[]>([]);

  const autosave = useAutosave(form.id, {
    onSaved: () => undefined,
    onRejected: (key, message) => setProblems(current => ({ ...current, [key]: message })),
  });
  const { resume } = autosave;

  // This device's anonymous draft and unsaved answers, restored after hydration (the server cannot know them).
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (initial.anonymousSent) forget(anonymousDraftKey(form.id));
    else setDraft(readAnswers(anonymousDraftKey(form.id)));
    const pending = readAnswers(pendingKey(form.id));
    if (Object.keys(pending).length) { setAnswers(current => ({ ...current, ...pending })); resume(pending); }
  }, [form.id, initial.anonymousSent, resume]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // What I gave, and what is shown: Data karyawan's answers stand in until I give my own.
  const stored = useMemo(() => ({ ...answers, ...draft }), [answers, draft]);
  const seen = useMemo(() => ({ ...prefill, ...stored }), [prefill, stored]);
  // Until I touch it: an answer I changed or emptied is mine, even when empty.
  const prefilled = (key: string) => prefill[key] !== undefined && !(key in answers);
  const steps = useMemo(() => stepsOf(content, seen, anonymousSent), [content, seen, anonymousSent]);
  const found = steps.findIndex(step => step.id === stepId);
  // A card that branching just removed: stay at the same place in the stack.
  const index = found >= 0 ? found : Math.min(lastIndex, steps.length - 1);
  const step = steps[index];
  const slots = useMemo(() => sectionsDone(content, answers, anonymousSent), [content, answers, anonymousSent]);
  const progress = useMemo(() => progressOf(content, answers, anonymousSent), [content, answers, anonymousSent]);
  const started = Object.keys(answers).length > 0 || Object.keys(draft).length > 0 || anonymousSent;

  useEffect(() => {
    if (!moved.current) return;
    window.scrollTo?.({ top: 0 });
    heading.current?.focus({ preventScroll: true });
  }, [stepId]);
  useEffect(() => () => reactionTimers.current.forEach(timer => window.clearTimeout(timer)), []);

  const showReaction = useCallback((question: QQuestion, value: AnswerValue | undefined) => {
    const text = reactionFor(question, value, names);
    reactionTimers.current.forEach(timer => window.clearTimeout(timer));
    if (!text) { setReaction(null); return; }
    setReaction({ text, fading: false });
    reactionTimers.current = [
      window.setTimeout(() => setReaction(current => current && { ...current, fading: true }), 1800),
      window.setTimeout(() => setReaction(null), 2100),
    ];
  }, [names]);

  const go = useCallback((target: number, back = false, list: Step[] = steps) => {
    if (leaving) return;
    const next = list[Math.max(0, Math.min(target, list.length - 1))];
    autosave.flush();
    // Leaving a section forward: its sticker pops if it is done now.
    const from = steps[index];
    const commit = () => {
      moved.current = true;
      if (!back && from && from.kind === "question" && next.kind !== "question" && slots.find(slot => slot.section.id === from.section.id)?.done) setPopped(from.section.id);
      else setPopped(null);
      setStepId(next.id); setLastIndex(list.indexOf(next)); setEntering(back ? "inBack" : "in"); setLeaving(null);
      setNudge(""); setReaction(null); setSendProblem("");
    };
    if (reducedMotion()) { commit(); return; }
    setLeaving(back ? "outBack" : "out");
    window.setTimeout(commit, PEEL_MS);
  }, [autosave, index, leaving, slots, steps]);

  const change = useCallback((question: QQuestion, value: AnswerValue, typing = false) => {
    setNudge("");
    setProblems(current => { if (!current[question.key]) return current; const rest = { ...current }; delete rest[question.key]; return rest; });
    if (anonymousIds.has(question.sectionId)) {
      // Anonymous: only on this device until it is sent.
      setDraft(current => { const next = { ...current, [question.key]: value }; writeAnswers(anonymousDraftKey(form.id), next); return next; });
    } else {
      setAnswers(current => ({ ...current, [question.key]: value }));
      autosave.save(question.key, value, typing ? TYPING_MS : 0);
    }
    if (!typing) showReaction(question, value);
  }, [anonymousIds, autosave, form.id, showReaction]);

  async function sendAnonymous(section: QSection) {
    setSending(true); setSendProblem("");
    const keys = new Set(questions.filter(question => question.sectionId === section.id).map(question => question.key));
    const payload = Object.fromEntries(Object.entries(draft).filter(([key, value]) => keys.has(key) && answered(value)));
    try {
      await praWamRequest(praWamApi.questionnaireAnonymous, { method: "POST", json: { answers: payload } });
      forget(anonymousDraftKey(form.id));
      setDraft({});
      setAnonymousSent(true);
      const after = stepsOf(content, answers, true);
      moved.current = true;
      setPopped(section.id);
      const intro = after.findIndex(item => item.id === `intro:${section.id}`);
      const next = after[intro + 1] ?? after.at(-1)!;
      setStepId(next.id); setLastIndex(intro + 1); setEntering("in");
    } catch (error) {
      const message = errorText(error);
      // Already in from another device: the section is done here too.
      if (/sudah kamu kirim/i.test(message)) { forget(anonymousDraftKey(form.id)); setDraft({}); setAnonymousSent(true); }
      setSendProblem(message);
    } finally {
      setSending(false);
    }
  }

  function next() {
    if (step.kind === "welcome") { go(started ? resumeIndex(steps, stored) : 1); return; }
    if (step.kind === "intro") { go(index + 1); return; }
    if (step.kind !== "question") return;
    const { question, section } = step;
    if (question.required && !complete(question, seen[question.key])) {
      setNudge(question.kind === "consent" ? "Centang dulu, ya." : question.kind === "matrix" ? "Isi setiap baris dulu, ya." : "Yang ini kami butuhkan. Singkat juga tidak apa-apa.");
      return;
    }
    if (section.anonymous && step.lastOfSection) { void sendAnonymous(section); return; }
    // Moving on from a card Data karyawan filled in is saying it is right: save it as mine.
    if (prefilled(question.key)) {
      const value = prefill[question.key];
      setAnswers(current => ({ ...current, [question.key]: value }));
      autosave.save(question.key, value, 0);
    }
    go(index + 1);
  }

  /** A section's number at the top: straight to its first card (its intro when it has none). */
  function pick(sectionId: string) {
    if (sending) return;
    const first = steps.findIndex(item => item.kind === "question" && item.section.id === sectionId);
    const target = first >= 0 ? first : steps.findIndex(item => item.id === `intro:${sectionId}`);
    if (target < 0 || target === index) return;
    if (step.kind === "question" && prefilled(step.question.key)) {
      const value = prefill[step.question.key];
      setAnswers(current => ({ ...current, [step.question.key]: value }));
      autosave.save(step.question.key, value, 0);
    }
    go(target, target < index);
  }

  const blocked = step.kind === "question" && step.question.required && !complete(step.question, seen[step.question.key]);
  const currentSection = step.kind === "intro" || step.kind === "question" ? step.section : undefined;
  const local = !!currentSection?.anonymous && !anonymousSent;

  const saveLine = local
    ? <span className={styles.saveState}><Lock aria-hidden />Disimpan di HP ini, belum dikirim</span>
    : autosave.status === "saving" ? <span className={styles.saveState}>Menyimpan…</span>
      : autosave.status === "saved" ? <span className={`${styles.saveState} ${styles.saved}`}><Check aria-hidden />Tersimpan</span>
        : autosave.status === "offline" ? <span className={`${styles.saveState} ${styles.problem}`}><CloudOff aria-hidden />Offline</span>
          : autosave.status === "retrying" ? <span className={`${styles.saveState} ${styles.problem}`}>Belum tersimpan</span>
            : null;
  const where = step.kind === "welcome" ? form.name : step.kind === "done" ? "Selesai" : step.section.short || step.section.title;
  const left = step.kind === "welcome" ? `sekitar ${form.minutes} menit` : step.kind === "done" ? "" : `± ${minutesLeft(steps, index)} menit lagi`;

  const card = `${styles.card} ${leaving ? styles[leaving] : styles[entering]}`;
  // The card is drawn from what the server has: wait until the last answers are in.
  const saving = autosave.status === "saving" || autosave.status === "retrying" || autosave.status === "offline" || autosave.waiting();
  const backs = [steps[index + 1], steps[index + 2]].map((upcoming, k) => {
    if (!upcoming) return null;
    const fill = upcoming.kind === "intro" ? (upcoming.section.anonymous ? styles.ink : styles.lime) : upcoming.kind === "done" ? styles.pink : styles.paper;
    return <div key={k} className={`${styles.back} ${k ? styles.b2 : styles.b1} ${fill}`} aria-hidden />;
  }).reverse();

  return <QuestionnaireApp>
    <Top name={form.name} home={home} slots={slots} current={currentSection?.id} popped={popped} preview={preview} onPick={pick}
      status={<><b>{where}</b><span aria-live="polite">{saveLine ?? left}</span></>} />
    <main className={`${styles.wrap} ${styles.main}`}>
      <div className={styles.stage}>
        {backs}
        {step.kind === "welcome" && <section className={card} aria-labelledby="cq-heading">
          <h1 id="cq-heading" ref={heading} tabIndex={-1}>Hai{nickname ? `, ${nickname}` : ""}! Kami ingin kenal kamu lebih dekat.</h1>
          {form.intro && <p className={styles.lead}>{form.intro}</p>}
          <ul className={styles.facts}>
            <li><Clock aria-hidden /><span>Sekitar {form.minutes} menit, banyak yang boleh dilewati.</span></li>
            <li><Lock aria-hidden /><span>Setiap kartu bilang siapa yang membaca jawabanmu.</span></li>
            <li><Pause aria-hidden /><span>Bisa berhenti kapan saja, jawaban tersimpan otomatis.</span></li>
          </ul>
          {progress.done && <p className={styles.sentBadge}><Check aria-hidden />Sudah selesai. Kamu masih bisa melihat dan mengubah jawaban.</p>}
          {progress.done && <button type="button" className={`${styles.btn} ${styles.outline}`} onClick={() => go(steps.length - 1)}><Sparkles aria-hidden />Lihat kartu karaktermu</button>}
          {form.editUntil && <p className={styles.tease}>Bisa diisi dan diubah sampai {deadlineLabel(form.editUntil)}.</p>}
        </section>}

        {step.kind === "intro" && <section className={`${card} ${step.section.anonymous ? styles.fillInk : styles.fill}`} aria-labelledby="cq-heading"
          style={step.section.anonymous ? undefined : { background: `var(${introFills[(step.number - 1) % introFills.length]})` }}>
          <div className={styles.qno}><span>Bagian {step.number} dari {slots.length}</span>{step.cards > 0 && <span>{step.cards} kartu</span>}</div>
          <div className={styles.big} aria-hidden>{step.number}</div>
          <h1 id="cq-heading" ref={heading} tabIndex={-1}>{step.section.hello || step.section.title}</h1>
          {step.section.intro && <p className={styles.lead}>{step.section.intro}</p>}
          {step.section.anonymous && (anonymousSent
            ? <p className={styles.sentBadge}><Check aria-hidden />Sudah terkirim tanpa nama</p>
            : <p className={styles.lead}>Jawaban di bagian ini disimpan tanpa namamu. Selama kamu mengisi, jawabannya hanya ada di HP ini. Saat kamu menekan Kirim bagian anonim, semuanya dikirim sekali, tanpa nama, dan tidak bisa diubah lagi.</p>)}
        </section>}

        {step.kind === "question" && <QuestionCard key={step.id} step={step} className={card} value={seen[step.question.key]} heading={heading} prefilled={prefilled(step.question.key)}
          departments={departments} people={people} nudge={nudge} problem={problems[step.question.key] ?? (step.section.anonymous && step.lastOfSection ? sendProblem : "")}
          reaction={reaction} onChange={(value, typing) => change(step.question, value, typing)}
          onBlur={() => showReaction(step.question, seen[step.question.key])} onEnter={next} />}

        {step.kind === "done" && progress.done && <section className={styles.finish} aria-labelledby="cq-heading">
          <h1 id="cq-heading" ref={heading} tabIndex={-1}>Selesai! Ini kartumu.</h1>
          <p className={styles.lead}>Terima kasih sudah bercerita, {nickname || "kamu"}.</p>
          {saving
            ? <p className={styles.hint} aria-live="polite">Menyimpan jawaban terakhir…</p>
            : <CardReveal formId={form.id} initial={drawnCard} nickname={nickname} hasPhoto={hasPhoto} />}
          {!preview && !saving && <p className={styles.hint}><a href={praWamPath.colleagues}>Lihat kartu rekan-rekanmu</a></p>}
          {form.editUntil && <p className={styles.hint}>Jawabanmu masih bisa diubah sampai {deadlineLabel(form.editUntil)}, kecuali bagian anonim. Kartumu sudah dikunci: tokoh, rarity, dan nomornya tetap.</p>}
        </section>}
        {step.kind === "done" && !progress.done && <section className={card} aria-labelledby="cq-heading">
          <h1 id="cq-heading" ref={heading} tabIndex={-1}>Hampir selesai</h1>
          <p className={styles.lead}>{progress.requiredLeft > 0 ? `Masih ada ${progress.requiredLeft} pertanyaan wajib yang belum dijawab.` : "Masih ada bagian yang belum selesai."}</p>
          <button type="button" className={`${styles.btn} ${styles.outline}`} onClick={() => go(resumeIndex(steps, stored))}>Isi yang tersisa</button>
        </section>}
      </div>
    </main>

    {(autosave.status === "retrying" || autosave.status === "offline") && !local && <div className={styles.wrap} role="status">
      <div className={styles.alert}>
        <span>{autosave.status === "offline" ? "Kamu sedang offline. Jawabanmu disimpan di HP ini dulu, dan dikirim saat tersambung lagi." : `Jawaban belum tersimpan. ${autosave.problem} Kami coba lagi otomatis.`}</span>
        <button type="button" className={`${styles.btn} ${styles.outline}`} onClick={autosave.flush}>Coba lagi</button>
      </div>
    </div>}

    <nav className={`${styles.wrap} ${styles.dock}`} aria-label="Navigasi kartu">
      {step.kind !== "welcome" && <button type="button" className={`${styles.btn} ${styles.icon}`} aria-label="Kembali" onClick={() => go(index - 1, true)}><ArrowLeft aria-hidden /></button>}
      {step.kind === "question" && !step.question.required && !answered(seen[step.question.key]) && !(step.section.anonymous && step.lastOfSection) &&
        <button type="button" className={`${styles.btn} ${styles.text}`} onClick={() => go(index + 1)}>Lewati</button>}
      <span className={styles.grow} />
      {step.kind === "done"
        ? <a className={`${styles.btn} ${styles.primary}`} href={home}>Ke Beranda</a>
        : <button type="button" className={`${styles.btn} ${styles.primary}`} aria-disabled={blocked || sending || undefined} onClick={() => { if (!sending) next(); }}>
          {primaryLabel(step, started, anonymousSent, sending)}
        </button>}
    </nav>
  </QuestionnaireApp>;
}

function primaryLabel(step: Step, started: boolean, anonymousSent: boolean, sending: boolean) {
  if (step.kind === "welcome") return started ? "Lanjutkan" : "Mulai";
  if (step.kind === "intro") return step.section.anonymous && !anonymousSent ? "Masuk" : step.cards ? "Buka kartu" : "Lanjut";
  if (step.kind !== "question") return "Lanjut";
  if (step.section.anonymous && step.lastOfSection) return sending ? "Mengirim…" : <><Send aria-hidden />Kirim bagian anonim</>;
  return step.lastOfSection ? "Selesaikan bagian" : "Lanjut";
}

type CardProps = {
  step: Extract<Step, { kind: "question" }>; className: string; value: AnswerValue | undefined; heading: RefObject<HTMLHeadingElement | null>;
  departments: string[]; people: Person[]; nudge: string; problem: string; reaction: { text: string; fading: boolean } | null;
  /** Filled in from Data karyawan and not confirmed yet. */
  prefilled?: boolean;
  onChange: (value: AnswerValue, typing?: boolean) => void; onBlur: () => void; onEnter: () => void;
};

/** One question: its number, the prompt, who reads it, a note, the control, and what to fix. */
function QuestionCard({ step, className, value, heading, departments, people, nudge, problem, reaction, prefilled = false, onChange, onBlur, onEnter }: CardProps) {
  const { question, section } = step;
  const Icon = visibilityIcons[question.visibility];
  const visibility = section.anonymous ? "anon" : question.visibility;
  return <section className={className} aria-labelledby="cq-heading">
    <div className={styles.qno}><span>Kartu {step.position} dari {step.total}</span><span>{question.required ? "Wajib" : "Boleh dilewati"}</span></div>
    <h2 id="cq-heading" ref={heading} tabIndex={-1}>{question.kind === "consent" ? "Satu hal sebelum mulai" : question.prompt}</h2>
    <span className={`${styles.tag} ${visibility === "rekan" ? styles.rekan : visibility === "anon" ? styles.anon : ""}`}><Icon aria-hidden />{visibilityLabels[visibility]}</span>
    {question.note && <p className={styles.note}><Info aria-hidden /><span>{question.note}</span></p>}
    {prefilled && <p className={styles.note}><Database aria-hidden /><span>Sudah terisi dari Data karyawan. Ubah bila kurang tepat, lalu Lanjut.</span></p>}
    <QuestionField question={question} value={value} onChange={onChange} labelledBy="cq-heading" departments={departments} people={people} onBlur={onBlur} onEnter={onEnter} />
    <p className={styles.nudge} aria-live="polite">{nudge}</p>
    {problem && <p className={styles.fieldProblem} role="alert">{problem}</p>}
    {step.lastOfSection && section.anonymous && <p className={styles.hint}>Setelah dikirim, jawaban bagian ini tidak bisa diubah, dan tidak terhubung ke namamu.</p>}
    {step.lastOfSection && section.tease && <p className={styles.tease}>{section.tease}</p>}
    <div aria-live="polite">{reaction && <div className={`${styles.react} ${reaction.fading ? styles.fade : ""}`}>{reaction.text}</div>}</div>
  </section>;
}
