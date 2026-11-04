import { Lock } from "lucide-react";
import { wamAdminPath } from "@/lib/routes";
import styles from "./questionnaire.module.css";

export type QuestionnaireTab = "konten" | "kartu" | "pengaturan" | "progres" | "data-hr";

const tabs: { key: QuestionnaireTab; label: string; href: string; locked?: boolean }[] = [
  { key: "konten", label: "Konten", href: wamAdminPath.questionnaire.content },
  { key: "kartu", label: "Kartu", href: wamAdminPath.questionnaire.cards },
  { key: "pengaturan", label: "Pengaturan", href: wamAdminPath.questionnaire.settings },
  { key: "progres", label: "Progres", href: wamAdminPath.questionnaire.progress },
  { key: "data-hr", label: "Data HR", href: wamAdminPath.questionnaire.hrData, locked: true },
];

/** The questionnaire's sub-pages, as a row of tabs that scrolls sideways on a phone. Data HR opens with the WAM email of someone on the HR access list. */
export function QuestionnaireTabs({ current }: { current: QuestionnaireTab }) {
  return <nav aria-label="Bagian kuesioner">
    <ul className={styles.tabs}>
      {tabs.map(tab => <li key={tab.key}>
        <a href={tab.href} className={styles.tab} aria-current={tab.key === current ? "page" : undefined}>
          {tab.locked && <Lock size={16} aria-hidden />}
          {tab.label}
          {tab.locked && <span className="sr-only"> (terkunci, buka dengan email HR)</span>}
        </a>
      </li>)}
    </ul>
  </nav>;
}
