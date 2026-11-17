import { CalendarDays } from "lucide-react";
import { ScreenContent } from "@/components/main-wam/shell";
import { EmptyState } from "@/components/main-wam/ui";
import { mainWamPath } from "@/lib/routes";
import { requireMainWamPage } from "@/lib/server/main-wam/gate";

export const dynamic = "force-dynamic";
export const metadata = { title: "Agenda · WAM", robots: { index: false } };

/**
 * P03 Agenda. PLACEHOLDER (fondasi): owner A (peserta), see docs/main-wam/KONTRAK.md §6.
 * Replace the body; keep requireMainWamPage first (the gate, checked by acara-pages.test.ts).
 */
export default async function AgendaPage() {
  await requireMainWamPage(mainWamPath.agenda());
  return <ScreenContent>
    <EmptyState icon={<CalendarDays />} title="Agenda">Sedang disiapkan.</EmptyState>
  </ScreenContent>;
}
