import type { Metadata } from 'next';
import { EmptyHome } from './EmptyHome';

export const metadata: Metadata = {
  title: 'Werkudara Journey',
  openGraph: { title: 'Werkudara Journey', description: 'Setiap pertemuan, dimulai dengan sambutan.', type: 'website', siteName: 'Werkudara Journey' },
  robots: { index: false, follow: false },
};

/**
 * journey.werkudara.group: a plain welcome that features and reveals no event. Guests come in
 * through the link they were given; what lies behind the links is for them only.
 */
export default function Home() {
  return <EmptyHome />;
}
