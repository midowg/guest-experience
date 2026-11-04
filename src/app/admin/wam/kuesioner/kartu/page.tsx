import { AdminShell, SetupNotice } from "@/components/admin/shared/AdminShell";
import { WamAdminFrame } from "@/components/admin/wam/WamAdminFrame";
import { CardCatalog } from "@/components/admin/wam/questionnaire/CardCatalog";
import { QuestionnaireTabs } from "@/components/admin/wam/questionnaire/QuestionnaireTabs";
import { Notice } from "@/components/ui";
import { CARDS_MIGRATION } from "@/lib/pra-wam/cards";
import { isSupabaseConfigured } from "@/lib/server/config";
import { requireAdminPage } from "@/lib/server/admin-session";
import { adminCards } from "@/lib/server/pra-wam/cards-admin";

export const dynamic = "force-dynamic";
export const metadata = { title: "Kartu karakter · Admin WAM" };

/** Any admin: the character cards: pictures, characters and their score rules, levels and odds, and the cards drawn. */
export default async function QuestionnaireCardsPage() {
  await requireAdminPage();
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  const cards = await adminCards();
  return <WamAdminFrame current="kuesioner">
    <QuestionnaireTabs current="kartu" />
    {cards
      ? <CardCatalog initial={cards} />
      : <Notice tone="warning">Kartu karakter menunggu migrasi <code>{CARDS_MIGRATION}</code>. Setelah migrasi dijalankan, katalog awal dari mockup (8 karakter, 5 level, 26 bagian tampilan) langsung tersedia di sini.</Notice>}
  </WamAdminFrame>;
}
