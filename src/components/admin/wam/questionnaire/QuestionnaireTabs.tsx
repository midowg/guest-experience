import { Lock } from "lucide-react";
import { PageTabs, type PageTab } from "@/components/console";
import { wamAdminPath } from "@/lib/routes";

export type QuestionnaireTab = "konten" | "kartu" | "pengaturan" | "progres" | "rekap" | "ekspor" | "data-hr" | "kamar";

/** A lock, and for screen readers the word for it, in front of a tab that opens with Data HR. */
const locked = <><Lock size={16} aria-hidden="true" /><span className="sr-only">Terkunci, buka dengan email HR: </span></>;

/** The questionnaire's sub-pages in the page's tab order; Kamar and Data HR open with the WAM email of someone on the HR access list. */
export const questionnaireTabs: readonly (PageTab & { key: QuestionnaireTab })[] = [
  { key: "konten", label: "Isi", href: wamAdminPath.questionnaire.content },
  { key: "pengaturan", label: "Pengaturan", href: wamAdminPath.questionnaire.settings },
  { key: "progres", label: "Progres", href: wamAdminPath.questionnaire.progress },
  { key: "rekap", label: "Rekap", href: wamAdminPath.questionnaire.recap },
  { key: "kartu", label: "Kartu", href: wamAdminPath.questionnaire.cards },
  { key: "kamar", label: "Kamar", href: wamAdminPath.questionnaire.rooms, icon: locked },
  { key: "ekspor", label: "Ekspor", href: wamAdminPath.questionnaire.export },
  { key: "data-hr", label: "Data HR", href: wamAdminPath.questionnaire.hrData, icon: locked },
];

export const questionnaireTabLabel = (key: QuestionnaireTab) => questionnaireTabs.find(tab => tab.key === key)!.label;

/** The questionnaire's sub-pages as the page's underlined tabs; the row scrolls sideways on a phone. */
export function QuestionnaireTabs({ current }: { current: QuestionnaireTab }) {
  return <PageTabs tabs={questionnaireTabs} current={current} label="Bagian kuesioner" />;
}
