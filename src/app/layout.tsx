import type { Metadata } from "next";
// Nunito: the one face for admin and guest text, rounded and friendly yet clear at small sizes.
import '@fontsource/nunito/400.css';
import '@fontsource/nunito/600.css';
import '@fontsource/nunito/700.css';
import '@fontsource/nunito/800.css';
// Inter: Figma's default face, for Studio Poster cards designed in Figma.
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
// Theme heading faces (src/lib/themes.ts). @font-face only downloads a file when a theme uses it.
import '@fontsource/lora/400.css';
import '@fontsource/lora/600.css';
import '@fontsource/playfair-display/400.css';
import '@fontsource/playfair-display/600.css';
import '@fontsource/cormorant-garamond/500.css';
import '@fontsource/cormorant-garamond/600.css';
import '@fontsource/eb-garamond/500.css';
import '@fontsource/eb-garamond/600.css';
// Welcome (Kunjungan Kantor, board 11): Source Sans 3 for reading, Montserrat for small labels.
import '@fontsource/source-sans-3/400.css';
import '@fontsource/source-sans-3/600.css';
import '@fontsource/source-sans-3/700.css';
import '@fontsource/montserrat/600.css';
import '@fontsource/montserrat/700.css';
import './globals.css';
import { siteUrl } from '@/lib/site-url';

export const metadata: Metadata = {
  // Link previews (WhatsApp) need absolute image addresses.
  metadataBase: siteUrl(),
  title: { default: 'Werkudara Journey', template: '%s | Werkudara Journey' },
  description: 'Werkudara Journey: informasi acara, jadwal, dan panduan untuk tamu Werkudara.',
  applicationName: 'Werkudara Journey',
  openGraph: { siteName: 'Werkudara Journey', type: 'website' },
  icons: { icon: '/favicon.png' },
  robots: { index: false, follow: false },
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="id"><body suppressHydrationWarning>{children}</body></html>;
}
