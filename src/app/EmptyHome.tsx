import Image from 'next/image';
import {
  ArrowRight, BookOpen, CalendarCheck, CalendarDays, Camera, ClipboardCheck, Frame, HandHeart, Languages, MapPin, MapPinned,
  MessageCircleHeart, MessageSquare, Phone, Plane, Smartphone, Sparkles, Star, Users,
} from 'lucide-react';
import { FRIDAY_SHARING_PATH, PLACE_GUIDE_PATH } from '@/lib/routes';

/** What a guest gets at each step of the journey: only features the guest pages really have. */
const stages = [
  {
    label: 'Sebelum', title: 'Datang dengan tenang', items: [
      { icon: ClipboardCheck, title: 'Konfirmasi kehadiran', text: 'Satu formulir singkat, untuk sendiri atau bersama rombongan.' },
      { icon: MapPin, title: 'Cara datang', text: 'Peta, petunjuk arah langkah demi langkah, dan info parkir.' },
      { icon: CalendarDays, title: 'Jadwal di kalender', text: 'Rundown per jam yang bisa disimpan ke kalender ponsel.' },
    ],
  },
  {
    label: 'Hari H', title: 'Semua ada di genggaman', items: [
      { icon: CalendarCheck, title: 'Panduan hari ini', text: 'Sesi yang sedang berlangsung dan catatan penting hari itu.' },
      { icon: Phone, title: 'Pendamping yang bisa dihubungi', text: 'Kontak tim kami, sekali ketuk lewat WhatsApp atau telepon.' },
      { icon: Users, title: 'Kenali tim kami', text: 'Siapa yang akan menyambut dan menemani Anda.' },
    ],
  },
  {
    label: 'Sesudah', title: 'Kenangan yang dibawa pulang', items: [
      { icon: Camera, title: 'Galeri foto', text: 'Foto kegiatan yang bisa dilihat dan diunduh.' },
      { icon: MessageSquare, title: 'Survei singkat', text: 'Masukan Anda membantu kami menyambut lebih baik.' },
      { icon: Star, title: 'Ucapan terima kasih', text: 'Halaman penutup yang menyapa Anda secara pribadi.' },
    ],
  },
];

/** The kinds of meeting the same journey serves. */
const kinds = [
  { icon: Sparkles, title: 'Welcome', text: 'Kunjungan tamu dan mitra ke kantor Werkudara.' },
  { icon: Star, title: 'Acara & gala', text: 'Seminar, peluncuran, hingga malam apresiasi.' },
  { icon: Plane, title: 'Program & perjalanan', text: 'Pelatihan beberapa hari dan trip bersama klien.' },
  { icon: BookOpen, title: 'E-Guide', text: 'Panduan destinasi: tempat, budaya, kuliner, dan tips.' },
  { icon: HandHeart, title: 'Friday Sharing', text: 'Kegiatan berbagi yang terbuka dan transparan.' },
  { icon: Frame, title: 'Kartu & poster', text: 'Poster, kartu ucapan, ID card, dan sertifikat yang diisi sendiri.' },
];

/**
 * The front page of Werkudara Journey: it introduces the guest experience and features no event.
 * It offers the pages meant for everyone (Your Visit, Friday Sharing) while they are published,
 * and deliberately no route into the management area: that is reached by typing its address.
 */
export function EmptyHome({ placeGuide = false, fridaySharing = false }: { placeGuide?: boolean; fridaySharing?: boolean }) {
  const links = [
    ...(placeGuide ? [{ href: PLACE_GUIDE_PATH, icon: MapPinned, title: 'Your Visit', text: 'Cara menuju kantor Werkudara.' }] : []),
    ...(fridaySharing ? [{ href: FRIDAY_SHARING_PATH, icon: HandHeart, title: 'Friday Sharing', text: 'Ikut berbagi bersama Werkudara.' }] : []),
  ];
  return <div className="site-shell">
    <header className="site-header"><div className="container">
      <span className="site-brand">
        <Image src="/werkudara_icon.png" alt="" width={35} height={40} />
        <span><strong>WERKUDARA</strong><span>Journey</span></span>
      </span>
    </div></header>
    <main className="landing container">
      <section className="landing-inner" aria-labelledby="home-title">
        <p className="eyebrow">Werkudara Journey</p>
        <h1 id="home-title">Setiap pertemuan,<br />dimulai dengan sambutan.</h1>
        <p>Werkudara Journey adalah pendamping tamu Werkudara. Dari tautan yang Anda terima, semua yang perlu diketahui sudah tersedia, sebelum Anda datang, saat hari H, sampai setelah pertemuan selesai.</p>
        <ul className="home-badges" aria-label="Untuk setiap tamu">
          <li><MessageCircleHeart size={16} aria-hidden="true" /> Menyapa Anda dengan nama</li>
          <li><Languages size={16} aria-hidden="true" /> Indonesia &amp; English</li>
          <li><Smartphone size={16} aria-hidden="true" /> Nyaman dibuka di ponsel</li>
        </ul>
      </section>

      <section className="home-section" aria-labelledby="home-journey">
        <p className="eyebrow">Pengalaman tamu</p>
        <h2 id="home-journey">Menemani dari awal sampai akhir</h2>
        <ol className="home-stages">
          {stages.map(stage => <li key={stage.label}>
            <p className="home-stage-label">{stage.label}</p>
            <h3>{stage.title}</h3>
            <ul>{stage.items.map(({ icon: Icon, title, text }) => <li key={title}>
              <Icon size={20} aria-hidden="true" />
              <div><strong>{title}</strong><span>{text}</span></div>
            </li>)}</ul>
          </li>)}
        </ol>
      </section>

      <section className="home-section" aria-labelledby="home-kinds">
        <p className="eyebrow">Untuk setiap pertemuan</p>
        <h2 id="home-kinds">Satu pengalaman, banyak cara bertemu</h2>
        <ul className="home-kinds">
          {kinds.map(({ icon: Icon, title, text }) => <li key={title}>
            <Icon size={22} aria-hidden="true" />
            <strong>{title}</strong>
            <span>{text}</span>
          </li>)}
        </ul>
      </section>

      {links.length > 0 && <nav className="home-section landing-links" aria-label="Terbuka untuk umum">
        <p className="eyebrow">Terbuka untuk umum</p>
        <ul>{links.map(({ href, icon: Icon, title, text }) => <li key={href}>
          <a href={href}><Icon size={22} aria-hidden="true" /><span><strong>{title}</strong><span>{text}</span></span><ArrowRight size={18} aria-hidden="true" /></a>
        </li>)}</ul>
      </nav>}

      <section className="home-section home-closing" aria-labelledby="home-link">
        <h2 id="home-link">Sudah menerima tautan?</h2>
        <p>Setiap pertemuan punya tautannya sendiri. Silakan buka tautan yang Anda terima dari tim Werkudara.</p>
        <p className="landing-en" lang="en">Welcome to Werkudara Journey. Every event has its own link: please open the one you received from the Werkudara team.</p>
      </section>
    </main>
    <footer className="site-footer"><div className="container">Werkudara · Journey</div></footer>
  </div>;
}
