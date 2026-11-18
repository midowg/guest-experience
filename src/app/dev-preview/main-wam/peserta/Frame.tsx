import type { ReactNode } from "react";
// The theme first (its reset), then the shell, as acara/layout.tsx and (app)/layout.tsx load them.
import { LangProvider } from "@/components/main-wam/i18n";
import { MainWamTheme } from "@/components/main-wam/theme";
import { MainWamShell } from "@/components/main-wam/shell";
import { homeGreeting } from "@/lib/main-wam/greeting";
import type { Lang } from "@/lib/main-wam/i18n";
import { sampleSettings, sampleViewer } from "@/lib/main-wam/sample";
import { mainWamScreen } from "@/lib/main-wam/screen";

/**
 * Fondasi's DevFrame for any moment (?hari=&jam=, not only the sampleTimes keys): the theme, the
 * shell drawn for `path`, Beranda's greeting for the sample person at `now`. Dev-preview only.
 */
export function Frame({ path, peran, now, unread = 3, lang = "id", children }: { path: string; peran?: string; now: Date; unread?: number; lang?: Lang; children: ReactNode }) {
  const viewer = sampleViewer(peran);
  return <MainWamTheme mode="light">
    <LangProvider lang={lang}>
      <MainWamShell screen={mainWamScreen(path.split(/[?#]/)[0], lang)} unread={unread} greeting={homeGreeting(now, viewer.name, sampleSettings().event, undefined, lang)}>
        {children}
      </MainWamShell>
    </LangProvider>
  </MainWamTheme>;
}
