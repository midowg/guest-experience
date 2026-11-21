import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { LangProvider } from "@/components/main-wam/i18n";
import { MainWamTheme, mainWamThemeColor } from "@/components/main-wam/theme";
import { readMainWamMode, readReduceMotion } from "@/lib/server/main-wam/appearance";
import { mainWamShown } from "@/lib/server/main-wam/gate";
import { readLang } from "@/lib/server/main-wam/lang";
import { mainWamThemeInput } from "@/lib/server/main-wam/theme";

export const metadata: Metadata = { title: "WAM", robots: { index: false } };

/**
 * The phone's status bar in Main WAM's own page colour (audit T-S01), light and dark entries in the
 * mode this device picked (Saya → Pengaturan → Tampilan; Sistem until it picks). For someone Main WAM is not shown to, nothing here: Pra WAM's stays.
 */
export async function generateViewport(): Promise<Viewport> {
  return (await mainWamShown()) ? { themeColor: mainWamThemeColor(await readMainWamMode()) } : {};
}

/*
 * Main WAM's root under /wam (docs/main-wam/KONTRAK.md §2): its own theme over Pra WAM's (WAM's
 * layout keeps the service worker, the in-app navigation and the manifest for both), read from
 * Admin WAM → Main WAM → Pengaturan; the neutral theme when nothing is set or anything fails.
 * The theme, and so the KV, reaches only those Main WAM is shown to (audit M6): everyone in mode
 * semua (the sign-in page too), a signed-in penguji otherwise. Anyone else gets nothing of Main
 * WAM from here: no theme, no KV, and (app)/layout.tsx draws no frame and no loading screen. The
 * frame and the gate are one level down, in (app)/layout.tsx.
 */
export default async function MainWamRootLayout({ children }: { children: ReactNode }) {
  if (!(await mainWamShown())) return children;
  const theme = await mainWamThemeInput().catch(() => null);
  const lang = await readLang();
  return <MainWamTheme theme={theme} mode={await readMainWamMode()} reduceMotion={await readReduceMotion()}><LangProvider lang={lang}>{children}</LangProvider></MainWamTheme>;
}
