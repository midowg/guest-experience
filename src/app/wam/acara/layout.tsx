import type { Metadata } from "next";
import type { ReactNode } from "react";
import { MainWamTheme } from "@/components/main-wam/theme";
import { mainWamThemeInput } from "@/lib/server/main-wam/theme";

export const metadata: Metadata = { title: "WAM", robots: { index: false } };

/*
 * Main WAM's root under /wam (docs/main-wam/KONTRAK.md §2): its own theme over Pra WAM's (WAM's
 * layout keeps the service worker, the in-app navigation and the manifest for both). Everything
 * here, the sign-in page included, is drawn in Main WAM's theme, read from Admin WAM → Main WAM →
 * Pengaturan; the neutral theme when nothing is set or anything fails. The frame (bars) and the
 * gate are one level down, in (app)/layout.tsx.
 */
export default async function MainWamRootLayout({ children }: { children: ReactNode }) {
  const theme = await mainWamThemeInput().catch(() => null);
  return <MainWamTheme theme={theme} mode="light">{children}</MainWamTheme>;
}
