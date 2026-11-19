import { ADMIN_HOME, BOOKING_PATH, PRA_WAM_PATH, WELLBEING_PATH, wamAdminPath } from '@/lib/routes';
import type { HomeStyle } from '@/lib/home-style';
import type { Door } from './home-doors';
import { HomeFan } from './HomeFan';
import { HomeLamp } from './HomeLamp';

const SIGNAGE_PATH = wamAdminPath.tv;

/** The apps behind a sign-in (19 Nov 2026): each opens its own login when nobody is signed in. */
const doors: Door[] = [
  { href: PRA_WAM_PATH, icon: 'wam', logo: '/wam/icon-192.png', tone: '#2f6feb', name: 'WAM 2027', what: 'Aplikasi karyawan', key: 'Akun WAM',
    description: 'Semua kebutuhan Werkudara Annual Meeting dalam satu aplikasi: agenda, appraisal, absen, dan MoM.' },
  { href: WELLBEING_PATH, icon: 'wlm', logo: '/wlm/icon-192.png', tone: '#e0457b', name: 'WLM', what: 'Werkudara Life Mode', key: 'Akun WAM',
    description: 'Catat olahraga dan kebiasaan sehat, kumpulkan poin, dan naik peringkat bersama tim.' },
  { href: BOOKING_PATH, icon: 'booking', tone: '#0d9488', name: 'Booking Kantor', what: 'Ruang meeting', key: 'Akun WAM',
    description: 'Pesan ruang meeting kantor dan lihat jadwalnya, tanpa bentrok.' },
  { href: SIGNAGE_PATH, icon: 'signage', tone: '#ea580c', name: 'Signage', what: 'TV kantor', key: 'Akun tim',
    description: 'Atur tayangan di TV kantor: pengumuman, jadwal ruang, dan foto meeting.' },
  { href: ADMIN_HOME, icon: 'admin', tone: '#7c3aed', name: 'Journey Admin', what: 'Untuk tim Werkudara', key: 'Akun tim',
    description: 'Siapkan undangan, kunjungan tamu, dan handbook acara dengan sentuhan Werkudara.' },
];

const guest = 'Tamu kami? Silakan buka tautan yang sudah kami kirimkan, semuanya sudah kami siapkan di sana.';

/**
 * The front page of Werkudara Journey: the apps of the team, each behind its own sign-in, in the look
 * the super admin picked (Kartu 3D or Lampu). Guests are sent back to their link. No guest page is
 * named or linked.
 */
export function EmptyHome({ style = 'kartu' }: { style?: HomeStyle }) {
  return style === 'lampu' ? <HomeLamp doors={doors} guest={guest} /> : <HomeFan doors={doors} guest={guest} />;
}
