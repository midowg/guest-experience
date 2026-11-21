import Image from "next/image";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { LoginForm } from "@/components/admin/shared/AuthControls";
import { Notice } from "@/components/ui";
import css from "@/components/admin/shared/login.module.css";
import { MIN_PASSWORD_LENGTH, MIN_SECRET_LENGTH } from "@/lib/admin-token";
import type { HomeStyle } from "@/lib/home-style";

// The office from the street, the pegasus on its wall: the one picture that says Werkudara at a glance.
const PHOTO = "/panduan-ke-werkudara/assets/exterior-1280.webp";

/**
 * Masuk admin (22 Nov 2026): the office photo over the whole screen, the form as one card on it, in the look the super admin
 * picked for the front page (Kartu 3D: a light card, Lampu: a dark one) over the office photo, full screen, quietly: no cursor
 * effects, nothing that keeps moving. Coming from the front page, its pegasus and "Journey" glide into
 * place (a cross-document view transition, where the browser has one).
 */
export function LoginScreen({ style, configured, next, expired }: { style: HomeStyle; configured: boolean; next: string; expired: boolean }) {
  return <main className={css.page} data-style={style}>
    {/* The office photo fills the whole screen; the form sits on it as one card. */}
    <Image src={PHOTO} alt="" fill priority sizes="100vw" className={css.photo} />
    <div className={css.shade} aria-hidden="true" />
    <div className={css.visualText} aria-hidden="true">
      <span className={css.mark} style={{ viewTransitionName: "wk-crest" }} />
      <p className={css.name}><span className={css.journey} style={{ viewTransitionName: "wk-title" }}>Journey</span> Admin</p>
      <p className={css.line}>Undangan, kunjungan tamu, dan aplikasi tim Werkudara, dikelola di satu tempat.</p>
    </div>

    <section className={css.panel} aria-labelledby="login-title">
      <div className={css.form}>
        <h1 id="login-title">Masuk</h1>
        {configured ? <>
          {expired && <Notice tone="warning">Sesi Anda berakhir. Masuk kembali untuk melanjutkan.</Notice>}
          <p className={css.lead}>Pakai email atau nama panggilan dan password WAM Anda.</p>
          <LoginForm next={next} />
          <p className={css.note}>Hanya untuk tim yang sudah diberi akses oleh super admin. Setiap masuk dicatat, dan sesi berlaku 12 jam.</p>
        </> : <>
          <Notice tone="warning">Login admin belum disiapkan, jadi panel ini terkunci.</Notice>
          <ol className={css.steps}>
            <li>Isi <code>ADMIN_PASSWORD</code> (minimal {MIN_PASSWORD_LENGTH} karakter) dan <code>ADMIN_SESSION_SECRET</code> (acak, minimal {MIN_SECRET_LENGTH} karakter) di environment server.</li>
            <li>Mulai ulang aplikasi, lalu buka halaman ini lagi.</li>
          </ol>
        </>}
      </div>
      <Link href="/" className={css.home}><ArrowLeft size={16} aria-hidden="true" /> Halaman utama Journey</Link>
    </section>
  </main>;
}
