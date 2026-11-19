import { ADMIN_HOME, BOOKING_PATH, PRA_WAM_PATH, WELLBEING_PATH, wamAdminPath } from '@/lib/routes';
import { HomeFan, type Door } from './HomeFan';

const SIGNAGE_PATH = wamAdminPath.tv;

/** The apps behind a sign-in (19 Nov 2026): each opens its own login when nobody is signed in. */
const doors: Door[] = [
  { href: PRA_WAM_PATH, icon: 'wam', tone: '#2f6feb', name: 'WAM 2027', what: 'Aplikasi karyawan', key: 'Akun WAM',
    description: 'Semua kebutuhan Werkudara Annual Meeting dalam satu aplikasi: agenda, appraisal, absen, dan MoM.' },
  { href: WELLBEING_PATH, icon: 'wlm', tone: '#e0457b', name: 'WLM', what: 'Wellbeing karyawan', key: 'Akun WAM',
    description: 'Catat olahraga dan kebiasaan sehat, kumpulkan poin, dan naik peringkat bersama tim.' },
  { href: BOOKING_PATH, icon: 'booking', tone: '#0d9488', name: 'Booking Kantor', what: 'Ruang meeting', key: 'Akun WAM',
    description: 'Pesan ruang meeting kantor dan lihat jadwalnya, tanpa bentrok.' },
  { href: SIGNAGE_PATH, icon: 'signage', tone: '#ea580c', name: 'Signage', what: 'TV kantor', key: 'Akun tim',
    description: 'Atur tayangan di TV kantor: pengumuman, jadwal ruang, dan foto meeting.' },
  { href: ADMIN_HOME, icon: 'admin', tone: '#7c3aed', name: 'Journey Admin', what: 'Untuk tim Werkudara', key: 'Akun tim',
    description: 'Siapkan undangan, kunjungan tamu, dan handbook acara dengan sentuhan Werkudara.' },
];

/**
 * The front page of Werkudara Journey: the apps of the team as a fan of 3D cards over a slow colour
 * mesh (a swipeable cover flow on a phone), light or dark. Each app asks for its own sign-in; guests
 * are sent back to their link. No guest page is named or linked.
 */
export function EmptyHome() {
  return <HomeFan doors={doors} guest="Tamu kami? Silakan buka tautan yang sudah kami kirimkan, semuanya sudah kami siapkan di sana." />;
}
