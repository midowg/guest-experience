import type { Metadata, Viewport } from "next";
import { Suspense, type ReactNode } from "react";
import { PwaRegister } from "@/components/pra-wam/PwaRegister";
import { WamNavigator } from "@/components/pra-wam/WamNavigator";
import { resolveWamTheme, WAM_THEME_COLORS, wamBodyStyle, type WamLook, type WamTheme } from "@/lib/pra-wam/theme";
import { PRA_WAM_PATH } from "@/lib/routes";
import { readWamLook, readWamTheme } from "@/lib/server/pra-wam/theme";

/** Every Pra WAM page: the app's own manifest, icons and colours, so it installs as "Pra WAM". */
export const metadata: Metadata = {
  applicationName: "WAM",
  manifest: `${PRA_WAM_PATH}/manifest.webmanifest`,
  icons: { icon: `${PRA_WAM_PATH}/icon-192.png`, apple: `${PRA_WAM_PATH}/apple-touch-icon.png` },
  appleWebApp: { capable: true, title: "WAM", statusBarStyle: "default" },
  robots: { index: false },
};

/**
 * Always one theme-color per device scheme, each already set for the person's choice, so
 * ThemeSwitch can update both in place without adding or removing tags.
 */
function themeColor(look: WamLook, theme: WamTheme): Viewport["themeColor"] {
  const colors = WAM_THEME_COLORS[look];
  return [
    { media: "(prefers-color-scheme: light)", color: colors[resolveWamTheme(theme, false)].bar },
    { media: "(prefers-color-scheme: dark)", color: colors[resolveWamTheme(theme, true)].bar },
  ];
}
export async function generateViewport(): Promise<Viewport> {
  const [look, theme] = await Promise.all([readWamLook(), readWamTheme()]);
  return { themeColor: themeColor(look, theme), viewportFit: "cover" };
}

/*
 * The wrapper carries the app's theme (data-wam-look, set by an admin) and the person's mode
 * (data-wam-theme). The page behind WAM is the app's colour from the first paint, so dark never
 * flashes white; it follows data-wam-theme, so switching the attribute is enough to repaint it.
 */
export default async function PraWamLayout({ children }: { children: ReactNode }) {
  const [look, theme] = await Promise.all([readWamLook(), readWamTheme()]);
  return <div data-wam-look={look} data-wam-theme={theme} style={{ display: "contents" }}>
    <style>{wamBodyStyle(look)}</style>
    <PwaRegister /><Suspense fallback={null}><WamNavigator /></Suspense>{children}
  </div>;
}
