import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

const LINKS: [string, string][] = [
  ["O02 Masuk", "masuk"], ["O02 salah / terkunci / offline / lupa", "masuk?status=salah"], ["O03 Izin notifikasi", "mulai"], ["O03 iPhone lewat browser", "mulai?status=iphone"],
  ["P01 Beranda 07.40", "beranda?waktu=pagi"], ["P02 Hari berangkat", "beranda?waktu=berangkat"], ["P01 Silent Meeting", "beranda?waktu=silent"], ["P01 Team building", "beranda?waktu=teamBuilding"],
  ["P01 BOD", "beranda?waktu=bod&peran=bod"], ["P01 belum dibuka 07.10", "beranda?hari=2&jam=07:10"], ["P01 sudah absen 07.52", "beranda?hari=2&jam=07:52"], ["P01 hari selesai", "beranda?hari=2&jam=22:10"],
  ["P01 voting", "beranda?hari=3&jam=10:00"], ["P01 survei", "beranda?hari=4&jam=08:10"], ["P01 memuat", "beranda?status=memuat"], ["P01 offline", "beranda?status=offline"],
  ["P03 Agenda", "agenda?waktu=pagi"], ["P03 jam berubah + batal", "agenda?hari=2&jam=10:30&status=batal"], ["P03 belum terbit", "agenda?status=kosong"],
  ["P04 Detail sesi", "sesi?waktu=pemaparan"], ["P04 Info lainnya", "sesi?info=1"], ["P04 jam berubah", "sesi?sesi=silent&waktu=silent"], ["P04 dibatalkan", "sesi?status=batal&waktu=pagi"],
  ["P05 Saya", "saya"], ["P05 Saya tanpa jejak karbon", "saya?karbon=mati"], ["P05B Saya BOD", "saya?peran=bod"], ["P05 foto profil", "saya?buka=foto"], ["P05 Bantuan", "saya/bantuan"], ["P05 Keluar", "saya?buka=keluar"],
  ["L01 Kamar", "kamar"], ["L01 kamar 5 orang", "kamar?kamar=5"], ["L01 belum terbit", "kamar?status=kamar-belum"],
  ["L03 Perjalanan", "perjalanan"], ["L03 pulang", "perjalanan?arah=pulang"], ["L03 kosong", "perjalanan?status=kosong"],
  ["L04 Panduan", "panduan"], ["L04 isi hotel", "panduan?isi=hotel"], ["L04 offline", "panduan?status=offline"],
  ["E01 Jejak karbon", "jejak-karbon"], ["E01 dari Saya", "jejak-karbon?dari=saya"], ["E01 cara menghitung", "jejak-karbon?cara=1"], ["E01 acara kecil", "jejak-karbon?kecil=1"], ["E01 tagihan hotel", "jejak-karbon?tagihan=1"], ["E01 belum ada", "jejak-karbon?status=belum"], ["E01 memuat", "jejak-karbon?status=memuat"], ["P01 jejak karbon belum ada", "beranda?karbon=belum"],
  ["N01 Notifikasi", "notifikasi"], ["N01 pengumuman", "notifikasi?buka=00000000-0000-4000-8009-000000000001"], ["N01 kosong", "notifikasi?status=kosong"],
  ["S02 Pengaturan", "pengaturan"], ["S02 notifikasi", "pengaturan?buka=notifikasi&hp=off"], ["S02 pasang", "pengaturan?buka=pasang"], ["S02 tampilan", "pengaturan?buka=tampilan"], ["S02 bahasa", "pengaturan?buka=bahasa"], ["S02 password", "pengaturan?buka=password"], ["S02 BOD + terpasang", "pengaturan?peran=bod&terpasang=1"],
];

/** Agen A's previews (dev only, 404 in production). */
export default function PesertaPreviews() {
  if (process.env.NODE_ENV === "production") notFound();
  return <main style={{ padding: 16, fontFamily: "system-ui" }}>
    <h1>Pratinjau agen A (peserta)</h1>
    <ul>{LINKS.map(([label, path]) => <li key={path}><a href={`/dev-preview/wam2026/peserta/${path}`}>{label}</a></li>)}</ul>
  </main>;
}
