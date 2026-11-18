import type { ReactNode } from "react";
// Theme first: its reset must load before the kit's component CSS (same order as the real layout).
import { LangProvider } from "@/components/main-wam/i18n";
import { MainWamTheme } from "@/components/main-wam/theme";
import { MainWamShell } from "@/components/main-wam/shell";
import { mainWamRole } from "@/lib/main-wam/access";
import type { Lang } from "@/lib/main-wam/i18n";
import { homeGreeting } from "@/lib/main-wam/greeting";
import { sampleSettings, sampleTime, sampleViewer } from "@/lib/main-wam/sample";
import { mainWamScreen } from "@/lib/main-wam/screen";
import type { MainWamThemeInput } from "@/lib/main-wam/types";

/**
 * A Main WAM screen in its real frame for dev-preview pages (fondasi; no sign-in, the pages 404 in
 * production): the theme, the shell drawn for `path` (as the real address would draw it), Beranda's
 * greeting for the sample person of `peran` at the sample moment `waktu` (sample.ts).
 *
 *   export default async function Preview({ searchParams }) {
 *     if (process.env.NODE_ENV === "production") notFound();
 *     const { peran, waktu } = await searchParams;
 *     return <DevFrame path={mainWamPath.agenda()} peran={peran} waktu={waktu}><AgendaScreen … /></DevFrame>;
 *   }
 */
export function DevFrame({ path, peran, waktu, unread = 3, theme, lang = "id", children }: {
  /** The address the screen stands for (its frame: tab, level, title). */
  path: string;
  /** peserta (default) | panitia | bod | admin. */
  peran?: string | null;
  /** A key of sampleTimes (default pagi: Sel, 5 Jan 07.40). */
  waktu?: string | null;
  unread?: number;
  /** ?lang=en (previewLang): the frame and the greeting in that language; the screen needs the same `lang` for what it computes. */
  lang?: Lang;
  theme?: MainWamThemeInput | null;
  children: ReactNode;
}) {
  const viewer = sampleViewer(peran);
  const screen = mainWamScreen(path.split(/[?#]/)[0], lang);
  return <MainWamTheme theme={theme} mode="light">
    <LangProvider lang={lang}>
      <MainWamShell screen={screen} unread={unread} greeting={homeGreeting(sampleTime(waktu), viewer.name, sampleSettings().event, mainWamRole(viewer), lang)}>
        {children}
      </MainWamShell>
    </LangProvider>
  </MainWamTheme>;
}
