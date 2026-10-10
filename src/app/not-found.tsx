import { ButtonLink } from '@/components/ui';
export default function NotFound() {
  return <main className="container landing"><div className="stack landing-inner"><p className="eyebrow">Halaman tidak tersedia</p><h1>Periksa kembali tautan undangan Anda.</h1><p>Acara mungkin belum diterbitkan, sudah diarsipkan, atau tautannya tidak tepat. Hubungi penyelenggara untuk memperoleh tautan terbaru.</p><div><ButtonLink href="/" variant="secondary">Kembali ke beranda</ButtonLink></div></div></main>;
}
