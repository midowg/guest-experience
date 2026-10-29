import type { Metadata } from 'next';
import { EmptyHome } from './EmptyHome';
import { getCurrentFridaySharing, getCurrentPlaceGuide } from '@/lib/server/events';
import { isSupabaseConfigured } from '@/lib/server/config';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Werkudara Journey',
  description: 'Menemani tamu Werkudara sebelum, saat, dan sesudah setiap pertemuan.',
  openGraph: { title: 'Werkudara Journey', description: 'Setiap pertemuan, dimulai dengan sambutan.', type: 'website', siteName: 'Werkudara' },
  robots: { index: false, follow: false },
};

/**
 * journey.werkudara.group: one domain for many kinds of events (visits, events, trips, sharing),
 * so the front page features none of them. Guests come in through their own link; the page only
 * points to what is meant for everyone, while it is published.
 */
export default async function Home() {
  const [guide, sharing] = isSupabaseConfigured()
    ? await Promise.all([getCurrentPlaceGuide().catch(() => null), getCurrentFridaySharing().catch(() => null)])
    : [null, null];
  return <EmptyHome placeGuide={!!guide} fridaySharing={!!sharing} />;
}
