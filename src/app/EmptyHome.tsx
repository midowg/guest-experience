import Image from 'next/image';
import { ArrowRight, CalendarDays, DoorOpen, LayoutDashboard, Lock } from 'lucide-react';
import { ADMIN_HOME, BOOKING_PATH, PRA_WAM_PATH } from '@/lib/routes';
import { SchemeSwitch } from './SchemeSwitch';

/** The apps behind a sign-in (19 Nov 2026): each opens its own login when nobody is signed in. */
const doors = [
  { href: PRA_WAM_PATH, icon: CalendarDays, tone: 'blue', name: 'WAM 2027', what: 'Aplikasi karyawan', key: 'Akun WAM',
    features: ['Agenda', 'Appraisal', 'Absen QR', 'MoM', 'Kuesioner', 'Dokumen'] },
  { href: BOOKING_PATH, icon: DoorOpen, tone: 'teal', name: 'Booking Kantor', what: 'Ruang meeting kantor', key: 'Akun WAM',
    features: ['Pesan ruang', 'Jadwal hari ini', 'Booking saya'] },
  { href: ADMIN_HOME, icon: LayoutDashboard, tone: 'purple', name: 'Journey Admin', what: 'Untuk tim Werkudara', key: 'Akun tim',
    features: ['Undangan & acara', 'Kunjungan tamu', 'Handbook', 'Friday Sharing', 'TV kantor'] },
] as const;

/**
 * The front page of Werkudara Journey: one screen, light or dark (the system's, or the visitor's
 * pick), beside the joglo in the office garden. The team finds its apps here, each behind its own
 * sign-in; guests are sent back to their link. No guest page is named or linked.
 */
export function EmptyHome() {
  return <main className="welcome-page">
    <div className="welcome-photo">
      <Image src="/panduan-ke-werkudara/assets/garden-960.webp" alt="Rumah joglo di taman Werkudara" fill priority sizes="(min-width: 64rem) 42vw, 100vw" />
    </div>
    <div className="welcome-text">
      <div className="welcome-top">
        {/* The Werkudara mark as a silhouette (public/werkudara-mark.png), coloured by the theme. */}
        <span className="welcome-logo" role="img" aria-label="Werkudara Group" />
        <SchemeSwitch />
      </div>
      <div className="welcome-main">
        <p className="welcome-kicker">Selamat datang</p>
        <h1 className="welcome-mark">Journey</h1>
        <p className="welcome-by">by Werkudara Group</p>

        <nav className="welcome-doors" aria-labelledby="doors-title">
          <h2 id="doors-title" className="welcome-doors-title">Pilih aplikasi</h2>
          <ul>{doors.map(door => {
            const Icon = door.icon;
            return <li key={door.href}>
              <a href={door.href} className="welcome-door" data-tone={door.tone}>
                <span className="welcome-door-icon" aria-hidden="true"><Icon size={22} /></span>
                <span className="welcome-door-text">
                  <span className="welcome-door-head"><strong>{door.name}</strong><span>{door.what}</span></span>
                  <span className="welcome-door-features">{door.features.join(' · ')}</span>
                </span>
                <span className="welcome-door-key"><Lock size={12} aria-hidden="true" /> {door.key}</span>
                <ArrowRight className="welcome-door-arrow" size={20} aria-hidden="true" />
              </a>
            </li>;
          })}</ul>
        </nav>

        <p className="welcome-note">Tamu kami? Silakan buka tautan yang sudah kami kirimkan, semuanya sudah kami siapkan di sana. Belum menerimanya? Hubungi tim Werkudara yang mengundang Anda.</p>
      </div>
      <div className="welcome-foot">
        <p lang="en">Welcome. If you are our guest, the link we sent you has everything ready for you.</p>
        <p className="welcome-sign">Salam hangat, Werkudara Group</p>
      </div>
    </div>
  </main>;
}
