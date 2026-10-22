import Image from 'next/image';
import { CalendarDays, MapPin, MessageCircleHeart } from 'lucide-react';

const points = [
  { icon: CalendarDays, title: 'Jadwal yang jelas', text: 'Rangkaian kegiatan per hari, bisa disimpan ke kalender ponsel.' },
  { icon: MapPin, title: 'Tiba tanpa ragu', text: 'Lokasi, petunjuk arah, dan hal yang perlu disiapkan.' },
  { icon: MessageCircleHeart, title: 'Selalu ada yang dihubungi', text: 'Konfirmasi kehadiran dan kontak panitia dalam satu halaman.' },
];

/**
 * The general welcome on the front page when no event is on air. Deliberately offers no route
 * into the management area: /admin is reached by typing it, and this is what a stranger sees.
 */
export function EmptyHome() {
  return <div className="site-shell">
    <header className="site-header"><div className="container">
      <span className="site-brand">
        <Image src="/werkudara_icon.png" alt="" width={35} height={40} />
        <span><strong>WERKUDARA</strong><span>Guest Experience</span></span>
      </span>
    </div></header>
    <main className="landing container"><div className="landing-inner">
      <p className="eyebrow">A thoughtful welcome</p>
      <h1>Setiap pertemuan,<br />dimulai dengan sambutan.</h1>
      <p>Selamat datang di Guest Experience Werkudara, halaman yang menemani tamu kami sebelum, saat, dan sesudah acara. Saat ini belum ada undangan yang sedang ditayangkan. Silakan buka tautan undangan dari penyelenggara, atau hubungi panitia acara Anda.</p>
      <ul className="landing-points">
        {points.map(({ icon: Icon, title, text }) => <li key={title}>
          <Icon size={22} aria-hidden="true" />
          <div><strong>{title}</strong><span>{text}</span></div>
        </li>)}
      </ul>
      <p className="landing-en" lang="en">Welcome to Werkudara Guest Experience. Please open the invitation link you received from the organisers.</p>
    </div></main>
    <footer className="site-footer"><div className="container">Werkudara · Guest Experience</div></footer>
  </div>;
}
