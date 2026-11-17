import { Images } from "lucide-react";
import { ScreenContent } from "@/components/main-wam/shell";
import { EmptyState } from "@/components/main-wam/ui";
import { mainWamPath } from "@/lib/routes";
import { requireMainWamPage } from "@/lib/server/main-wam/gate";

export const dynamic = "force-dynamic";
export const metadata = { title: "Momen · WAM", robots: { index: false } };

/**
 * M01–M03 Momen, the stack. PLACEHOLDER (fondasi): owner B (momen), see docs/main-wam/KONTRAK.md §6.
 * Replace the body; keep requireMainWamPage first (the gate, checked by acara-pages.test.ts).
 */
export default async function MomenPage() {
  await requireMainWamPage(mainWamPath.moments());
  return <ScreenContent>
    <EmptyState icon={<Images />} title="Momen" tone="dark">Sedang disiapkan.</EmptyState>
  </ScreenContent>;
}
