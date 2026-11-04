import { Lock } from "lucide-react";
import { answered, visibleContent, type AnswerValue, type Answers, type QQuestion, type QSection } from "@/lib/pra-wam/questionnaire";
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

/** After the deadline or once HR closes it: my answers per section, nothing to change. */
export function ReadOnlyAnswers({ name, home, sections, questions, answers, anonymousSent, slots, people }: {
  name: string; home: string; sections: QSection[]; questions: QQuestion[]; answers: Answers; anonymousSent: boolean; slots: Slot[];
  people: { id: string; name: string }[];
}) {
  const names = new Map(people.map(person => [person.id, person.name]));
  return <QuestionnaireApp>
    <Top name={name} home={home} slots={slots} status={<><b>Jawabanmu</b><span><Lock size={14} aria-hidden /> hanya baca</span></>} />
    <main className={`${styles.wrap} ${styles.answers}`}>
      <section className={`${styles.card} ${styles.closed}`}>
        <h1>Kuesioner sudah ditutup</h1>
        <p className={styles.lead}>Terima kasih. Jawabanmu tidak bisa diubah lagi. Ini yang kamu isi.</p>
        <a className={`${styles.btn} ${styles.primary}`} href={home}>Ke Beranda</a>
      </section>
      {visibleContent({ sections, questions }, answers).map(({ section, questions: shown }) => <section key={section.id} className={styles.card} aria-labelledby={`cq-${section.id}`}>
        <h2 id={`cq-${section.id}`}>{section.title}</h2>
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
      </section>)}
    </main>
  </QuestionnaireApp>;
}
