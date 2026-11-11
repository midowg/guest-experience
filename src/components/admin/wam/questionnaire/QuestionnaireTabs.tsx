import { PageTabs, type PageTab } from "@/components/console";
import { wamAdminPath } from "@/lib/routes";

/** "progres", "ekspor" and "data-hr" stay as keys for the old addresses, which now lead to Rekap. */
export type QuestionnaireTab = "konten" | "kartu" | "pengaturan" | "progres" | "rekap" | "ekspor" | "data-hr" | "kamar";

/**
 * The questionnaire's sub-pages in the page's tab order. Since 11 Nov 2026 Rekap holds the
 * progress, every answer (HR included) and the Excel, and nothing is locked for an admin.
 */
export const questionnaireTabs: readonly (PageTab & { key: QuestionnaireTab })[] = [
  { key: "konten", label: "Isi", href: wamAdminPath.questionnaire.content },
  { key: "rekap", label: "Rekap", href: wamAdminPath.questionnaire.recap },
  { key: "pengaturan", label: "Pengaturan", href: wamAdminPath.questionnaire.settings },
  { key: "kartu", label: "Kartu", href: wamAdminPath.questionnaire.cards },
  { key: "kamar", label: "Kamar", href: wamAdminPath.questionnaire.rooms },
];

export const questionnaireTabLabel = (key: QuestionnaireTab) => questionnaireTabs.find(tab => tab.key === key)?.label ?? "Rekap";

/** The questionnaire's sub-pages as the page's underlined tabs; the row scrolls sideways on a phone. */
export function QuestionnaireTabs({ current }: { current: QuestionnaireTab }) {
  return <PageTabs tabs={questionnaireTabs} current={current} label="Bagian kuesioner" />;
}
