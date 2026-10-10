"use client";

import { Button, ButtonLink, Notice } from "@/components/ui";

export default function AdminError({ reset }: { reset: () => void }) {
  return <main className="container stack"><h1>Halaman admin belum dapat dimuat</h1><Notice tone="error">Data belum dapat diambil dari server. Periksa koneksi, sesi admin, dan kesiapan konfigurasi Supabase. Tidak ada data contoh yang ditampilkan.</Notice><div className="row"><Button type="button" onClick={reset}>Coba lagi</Button><ButtonLink href="/admin/login" variant="secondary">Kembali ke halaman masuk</ButtonLink></div></main>;
}
