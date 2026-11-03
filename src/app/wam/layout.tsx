import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { PwaRegister } from "@/components/pra-wam/PwaRegister";
import { PRA_WAM_PATH } from "@/lib/routes";

/** Every Pra WAM page: the app's own manifest, icons and colours, so it installs as "Pra WAM". */
export const metadata: Metadata = {
  applicationName: "WAM",
  manifest: `${PRA_WAM_PATH}/manifest.webmanifest`,
  icons: { icon: `${PRA_WAM_PATH}/icon-192.png`, apple: `${PRA_WAM_PATH}/apple-touch-icon.png` },
  appleWebApp: { capable: true, title: "WAM", statusBarStyle: "default" },
  robots: { index: false },
};
export const viewport: Viewport = {
  themeColor: [{ media: "(prefers-color-scheme: light)", color: "#1551A0" }, { media: "(prefers-color-scheme: dark)", color: "#0E1218" }],
  viewportFit: "cover",
};

export default function PraWamLayout({ children }: { children: ReactNode }) {
  return <><PwaRegister />{children}</>;
}
