import { Lock } from "lucide-react";
import { answered, visibleContent, type AnswerValue, type Answers, type QQuestion, type QSection } from "@/lib/pra-wam/questionnaire";
import type { CardView } from "@/lib/server/pra-wam/cards";
import { CardReveal } from "./CardReveal";
import { QuestionnaireApp, Top, type Slot } from "./Frame";
import styles from "./questionnaire.module.css";

/** An answer as words: choices joined, people by name, matrix rows "Baris: pilihan". */
export function answerText(question: QQuestion, value: AnswerValue | undefined, names: Map<string, string>): string {
  if (value === undefined || !answered(value)) return "";
  if (typeof value === "boolean") return value ? "Ya, setuju" : "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return (question.kind === "person" ? value.map(id => names.get(id) ?? "Rekan") : value).join(", ");
  return question.matrixRows.filter(row => value[row]).map(row => `${row}: ${value[row]}`).join("\n");
}

/**
 * After the deadline or once HR closes it, or once my card is out (`finished`, 16 Nov 2026): my
 * answers per section, nothing to change.
 */
export function ReadOnlyAnswers({ name, home, sections, questions, answers, anonymousSent, slots, people, card, finished = false, back }: {
  name: string; home: string; sections: QSection[]; questions: QQuestion[]; answers: Answers; anonymousSent: boolean; slots: Slot[];
  /** Still open, but I finished and my card is out: locked for me. */
  finished?: boolean;
  people: { id: string; name: string }[];
  /** My character card, shown open, when I have one. */
  card?: { formId: string; view: CardView; nickname: string; hasPhoto: boolean } | null;
  /** The answers' own page, opened from my card (17 Nov 2026): the way back to it. */
  back?: { href: string; label: string };
}) {
  const names = new Map(people.map(person => [person.id, person.name]));
  return <QuestionnaireApp>
    <Top name={name} home={home} slots={slots} status={<><b>Jawabanmu</b><span><Lock size={14} aria-hidden /> hanya baca</span></>} />
    <main className={`${styles.wrap} ${styles.answers}`}>
      {back
        ? <section className={`${styles.card} ${styles.closed}`}>
          <h1>Jawaban kuesionermu</h1>
          <p className={styles.lead}>Ini yang kamu isi. Kartumu sudah keluar, jadi jawabanmu dikunci. Buka tiap bagian untuk melihatnya.</p>
          <a className={`${styles.btn} ${styles.primary}`} href={back.href}>{back.label}</a>
        </section>
        : <section className={`${styles.card} ${styles.closed}`}>
          <h1>{finished ? "Kuesionermu sudah selesai" : "Kuesioner sudah ditutup"}</h1>
          <p className={styles.lead}>{finished ? "Terima kasih. Kartumu sudah keluar, jadi jawabanmu dikunci. Ini yang kamu isi." : "Terima kasih. Jawabanmu tidak bisa diubah lagi. Ini yang kamu isi."}</p>
          <a className={`${styles.btn} ${styles.primary}`} href={home}>Ke Beranda</a>
        </section>}
      {card && <CardReveal formId={card.formId} initial={card.view} nickname={card.nickname} hasPhoto={card.hasPhoto} settled />}
      {/* The answers, each part folded at first (17 Nov 2026). */}
      {!back && <h2 className={styles.answersHeading}>Jawaban kuesionermu</h2>}
      {visibleContent({ sections, questions }, answers).map(({ section, questions: shown }) => <details key={section.id} className={`${styles.card} ${styles.fold}`}>
        <summary><span className={styles.foldTitle}>{section.title}</span><span className={styles.foldCount}>{section.anonymous ? "Anonim" : `${shown.length} pertanyaan`}</span></summary>
        {section.anonymous
          ? <p className={styles.lead}>{anonymousSent ? "Sudah terkirim tanpa nama. Jawabannya tidak tersimpan bersama namamu, jadi tidak ditampilkan di sini." : "Tidak dikirim."}</p>
          : <dl>
            {shown.map(question => {
              const text = answerText(question, answers[question.key], names);
              return <div key={question.key} className={styles.qa}>
                <dt>{question.prompt}</dt>
                <dd>{text || <span className={styles.empty}>Tidak dijawab</span>}</dd>
              </div>;
            })}
          </dl>}
      </details>)}
    </main>
  </QuestionnaireApp>;
}
