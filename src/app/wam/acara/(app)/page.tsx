import { House } from "lucide-react";
import { BerandaMomen } from "@/components/main-wam/momen/BerandaMomen";
import { BerandaBod } from "@/components/main-wam/panitia/BerandaBod";
import { BerandaPanitia } from "@/components/main-wam/panitia/BerandaPanitia";
import { ScreenContent, Stack } from "@/components/main-wam/shell";
import { EmptyState } from "@/components/main-wam/ui";
import { mainWamPath } from "@/lib/routes";
import { requireMainWamPage } from "@/lib/server/main-wam/gate";

export const dynamic = "force-dynamic";
export const metadata = { title: "Beranda · WAM", robots: { index: false } };

/**
 * P01/P02 Beranda (BOD B01 and panitia K01 add their card). PLACEHOLDER (fondasi): owner A (peserta),
 * see docs/main-wam/KONTRAK.md §6. Replace the body; keep requireMainWamPage first (the gate, checked
 * by acara-pages.test.ts) and the other areas' slots: BerandaPanitia and BerandaBod (C) under
 * Sekarang, BerandaMomen (B) after the contextual card. The greeting and the bell are the frame's.
 */
export default async function HomePage() {
  const context = await requireMainWamPage(mainWamPath.home);
  const now = new Date();
  return <ScreenContent>
    <Stack>
      <EmptyState icon={<House />} title="Beranda">Sedang disiapkan.</EmptyState>
      <BerandaPanitia context={context} now={now} />
      <BerandaBod context={context} now={now} />
      <BerandaMomen context={context} now={now} />
    </Stack>
  </ScreenContent>;
}
