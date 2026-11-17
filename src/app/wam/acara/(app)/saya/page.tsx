import { UserRound } from "lucide-react";
import { ScreenContent } from "@/components/main-wam/shell";
import { EmptyState } from "@/components/main-wam/ui";
import { mainWamPath } from "@/lib/routes";
import { requireMainWamPage } from "@/lib/server/main-wam/gate";

export const dynamic = "force-dynamic";
export const metadata = { title: "Saya · WAM", robots: { index: false } };

/**
 * P05 Saya (BOD: P05B). PLACEHOLDER (fondasi): owner A (peserta), see docs/main-wam/KONTRAK.md §6.
 * Replace the body; keep requireMainWamPage first (the gate, checked by acara-pages.test.ts).
 */
export default async function SayaPage() {
  await requireMainWamPage(mainWamPath.me);
  return <ScreenContent>
    <EmptyState icon={<UserRound />} title="Saya">Sedang disiapkan.</EmptyState>
  </ScreenContent>;
}
