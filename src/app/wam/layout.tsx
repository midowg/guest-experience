import type { Metadata, Viewport } from "next";
import { Suspense, type ReactNode } from "react";
import { PwaRegister } from "@/components/pra-wam/PwaRegister";
import { WamNavigator } from "@/components/pra-wam/WamNavigator";
import { resolveWamTheme, WAM_THEME_COLORS as C, type WamTheme } from "@/lib/pra-wam/theme";
import { PRA_WAM_PATH } from "@/lib/routes";
import { readWamTheme } from "@/lib/server/pra-wam/theme";

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
function themeColor(theme: WamTheme): Viewport["themeColor"] {
  return [
    { media: "(prefers-color-scheme: light)", color: C[resolveWamTheme(theme, false)].bar },
    { media: "(prefers-color-scheme: dark)", color: C[resolveWamTheme(theme, true)].bar },
  ];
}
export async function generateViewport(): Promise<Viewport> {
  return { themeColor: themeColor(await readWamTheme()), viewportFit: "cover" };
}

// The page behind WAM is the app's colour from the first paint, so dark never flashes white. It
// follows the data-wam-theme wrapper, so switching the attribute is enough to repaint it.
const bodyStyle = `body{background:${C.light.page};color-scheme:light}`
  + `body:has([data-wam-theme="dark"]){background:${C.dark.page};color-scheme:dark}`
  + `@media (prefers-color-scheme:dark){body:has([data-wam-theme="system"]){background:${C.dark.page};color-scheme:dark}}`;

export default async function PraWamLayout({ children }: { children: ReactNode }) {
  const theme = await readWamTheme();
  return <div data-wam-theme={theme} style={{ display: "contents" }}>
    <style>{bodyStyle}</style>
    <PwaRegister /><Suspense fallback={null}><WamNavigator /></Suspense>{children}
  </div>;
}
