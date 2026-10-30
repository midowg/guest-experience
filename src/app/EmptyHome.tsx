import Image from 'next/image';

/**
 * The front page of Werkudara Journey: one full, quiet screen that greets whoever arrives, light or
 * dark with the visitor's system, beside a photo of the joglo in the office garden. It says nothing
 * about what the guest pages hold and links to none of them; guests come in through their link.
 */
export function EmptyHome() {
  return <main className="welcome-page">
    <div className="welcome-photo">
      <Image src="/panduan-ke-werkudara/assets/garden-960.webp" alt="Rumah joglo di taman Werkudara" fill priority sizes="(min-width: 64rem) 45vw, 100vw" />
    </div>
    <div className="welcome-text">
      <div className="welcome-main">
        {/* The Werkudara mark as a silhouette (public/werkudara-mark.png), coloured by the theme. */}
        <span className="welcome-logo" role="img" aria-label="Werkudara Group" />
        <p className="welcome-kicker">Selamat datang</p>
        <h1 className="welcome-mark">Journey</h1>
        <p className="welcome-by">by Werkudara Group</p>
        <p className="welcome-lead">Senang sekali Anda mampir. Kalau Anda tamu kami, silakan buka tautan yang sudah kami kirimkan. Semua yang Anda perlukan sudah kami siapkan di sana.</p>
        <p className="welcome-note">Belum menerima tautan? Hubungi tim Werkudara yang mengundang Anda, kami dengan senang hati membantu.</p>
      </div>
      <div className="welcome-foot">
        <p lang="en">Welcome. If you are our guest, the link we sent you has everything ready for you.</p>
        <p className="welcome-sign">Salam hangat, Werkudara Group</p>
      </div>
    </div>
  </main>;
}
