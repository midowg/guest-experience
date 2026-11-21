import { ADMIN_HOME, BOOKING_PATH, HR_PATH, PRA_WAM_PATH, WELLBEING_PATH, wamAdminPath } from '@/lib/routes';
import type { HomeStyle } from '@/lib/home-style';
import { defaultHomeMenu, type HomeApp, type HomeMenuItem } from '@/lib/home-menu';
import type { Door } from './home-doors';
import { HomeFan } from './HomeFan';
import { HomeLamp } from './HomeLamp';

const SIGNAGE_PATH = wamAdminPath.tv;

/**
 * Where each app opens, and its logo when it has one (19 Nov 2026): fixed here, never from the menu
 * the super admin edits, so the front page can only open these apps, each behind its own sign-in.
 */
const appDoors: Record<HomeApp, { href: string; logo?: string }> = {
  wam: { href: PRA_WAM_PATH, logo: '/wam/icon-192.png' },
  wlm: { href: WELLBEING_PATH, logo: '/wlm/icon-192.png' },
  booking: { href: BOOKING_PATH },
  hr: { href: HR_PATH, logo: '/people/icon-192.png' },
  signage: { href: SIGNAGE_PATH },
  admin: { href: ADMIN_HOME },
};

const guest = 'Tamu kami? Silakan buka tautan yang sudah kami kirimkan, semuanya sudah kami siapkan di sana.';

/**
 * The front page of Werkudara Journey: the apps of the team, each behind its own sign-in, in the look
 * the super admin picked (Kartu 3D or Lampu) and the menu set there (which apps, order, text, colour). Guests are sent back to their link. No guest page is
 * named or linked.
 */
export function EmptyHome({ style = 'kartu', menu = defaultHomeMenu }: { style?: HomeStyle; menu?: HomeMenuItem[] }) {
  const doors: Door[] = menu.filter(item => item.shown).map(item => ({
    ...appDoors[item.app], icon: item.app, tone: item.tone, name: item.name, what: item.what, key: item.account, description: item.description,
  }));
  return style === 'lampu' ? <HomeLamp doors={doors} guest={guest} /> : <HomeFan doors={doors} guest={guest} />;
}
