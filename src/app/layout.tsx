import type { Metadata } from "next";
import '@fontsource/source-sans-pro/300.css';
import '@fontsource/source-sans-pro/400.css';
import '@fontsource/source-sans-pro/600.css';
import '@fontsource/montserrat/400.css';
import '@fontsource/montserrat/600.css';
// Theme heading faces (src/lib/themes.ts). @font-face only downloads a file when a theme uses it.
import '@fontsource/lora/400.css';
import '@fontsource/lora/600.css';
import '@fontsource/playfair-display/400.css';
import '@fontsource/playfair-display/600.css';
import '@fontsource/cormorant-garamond/500.css';
import '@fontsource/cormorant-garamond/600.css';
import '@fontsource/nunito/400.css';
import '@fontsource/nunito/700.css';
// Admin face: open letterforms that stay readable at small sizes (components/admin/admin.module.css).
import '@fontsource/plus-jakarta-sans/400.css';
import '@fontsource/plus-jakarta-sans/500.css';
import '@fontsource/plus-jakarta-sans/600.css';
import '@fontsource/plus-jakarta-sans/700.css';
import './globals.css';
import { siteUrl } from '@/lib/site-url';

export const metadata: Metadata = {
  // Link previews (WhatsApp) need absolute image addresses.
  metadataBase: siteUrl(),
  title: { default: 'Guest Experience | Werkudara', template: '%s | Werkudara' },
  description: 'Informasi acara dan konfirmasi kehadiran tamu Werkudara.',
  icons: { icon: '/favicon.png' },
  robots: { index: false, follow: false },
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="id"><body suppressHydrationWarning>{children}</body></html>;
}
