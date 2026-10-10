import type { Metadata } from 'next';
import { EventExperience } from '@/components/guest/EventExperience';
import { EmptyHome } from './EmptyHome';
import { getFeaturedEvent } from '@/lib/server/events';
import { isSupabaseConfigured } from '@/lib/server/config';
import { formatDate } from '@/lib/format';

export const dynamic = 'force-dynamic';

async function featured() {
  if (!isSupabaseConfigured()) return null;
  return getFeaturedEvent().catch(() => null);
}

export async function generateMetadata(): Promise<Metadata> {
  const event = await featured();
  if (!event) return { title: 'Guest Experience', robots: { index: false, follow: false } };
  return {
    title: event.title,
    description: `${event.title} — ${formatDate(event.starts_at, event.timezone)}${event.venue_name ? `, ${event.venue_name}` : ''}.`,
    robots: { index: false, follow: false },
  };
}

export default async function Home() {
  const event = await featured();
  if (event) return <EventExperience event={event} />;
  return <EmptyHome />;
}
