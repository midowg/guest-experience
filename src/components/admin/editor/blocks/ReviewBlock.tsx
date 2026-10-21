import { ArrowUpRight } from "lucide-react";
import { ButtonLink } from "@/components/ui";
import type { EditorKit } from "@/components/admin/editor/kit";

export function ReviewBlock({ kit }: { kit: EditorKit }) {
  const { event, text } = kit;
  return <div className="stack">
    <p>Menampilkan tombol “Bagikan ulasan Anda” di penutup undangan, menuju halaman ulasan Google Werkudara. Berbeda dari survei feedback: ulasan disimpan oleh Google, dapat tampil publik di Google, dan tidak masuk ke panel ini. Google dapat meminta tamu masuk ke akun Google.</p>
    <ol><li>Buka profil bisnis Google Werkudara yang Anda kelola, lalu pilih “Minta ulasan” atau bagikan tautan ulasan.</li><li>Salin tautan resmi dan tempel di bawah. Gunakan “Periksa tautan” untuk memastikan tujuan benar.</li><li>Nyalakan switch di kanan atas, lalu simpan dan publikasikan acara. Tombol muncul di bagian penutup undangan.</li></ol>
    {text("review_heading", "Judul ulasan (opsional)", 200, false, "Kosongkan untuk tidak menampilkan judul tambahan.")}
    {text("review_description", "Deskripsi ulasan (opsional)", 1000, true, "Contoh: Jika berkenan, bagikan pengalaman Anda melalui Google Review. Ulasan di Google dapat tampil publik.")}
    {text("review_button_label", "Teks tombol ulasan (opsional)", 100, false, "Kosongkan untuk memakai Bagikan ulasan Anda.")}
    {text("review_url", "Tautan ulasan Google HTTPS", 8000, false, "Tersedia untuk semua tamu tanpa menyaring skor feedback. Matikan switch dan simpan untuk menyembunyikan tombol.")}
    {/^https:\/\/[^\s/]+/.test(event.review_url) && <ButtonLink variant="secondary" href={event.review_url} target="_blank" rel="noopener noreferrer">Periksa tautan <ArrowUpRight size={17} aria-hidden="true" /><span className="sr-only"> (tab baru)</span></ButtonLink>}
  </div>;
}
