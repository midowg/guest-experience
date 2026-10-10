'use client';
import { Button } from '@/components/ui';
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="container landing"><div className="stack landing-inner"><p className="eyebrow">Koneksi belum tersedia</p><h1>Mohon coba beberapa saat lagi.</h1><p>Informasi belum dapat dimuat. Tidak ada konfirmasi keberhasilan penyimpanan dari halaman ini.</p><div><Button onClick={reset}>Coba kembali</Button></div></div></main>;
}
