import type { Metadata } from "next";
import '@fontsource/source-sans-pro/300.css';
import '@fontsource/source-sans-pro/400.css';
import '@fontsource/source-sans-pro/600.css';
import '@fontsource/montserrat/400.css';
import '@fontsource/montserrat/600.css';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Guest Experience | Werkudara', template: '%s | Werkudara' },
  description: 'Informasi acara dan konfirmasi kehadiran tamu Werkudara.',
  icons: { icon: '/werkudara_icon.png' },
  robots: { index: false, follow: false },
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="id"><body suppressHydrationWarning>{children}</body></html>;
}
