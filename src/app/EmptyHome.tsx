import Image from 'next/image';

/**
 * The front page of Werkudara Journey: one quiet screen that greets whoever arrives. It says
 * nothing about what the guest pages hold and links to none of them; guests come in through the
 * link the team sent them.
 */
export function EmptyHome() {
  return <main className="welcome-page">
    <div className="welcome-card">
      <Image src="/werkudara_icon.png" alt="Werkudara" width={48} height={55} priority />
      <h1>Selamat datang.</h1>
      <p>Senang sekali Anda mampir. Kalau Anda tamu kami, silakan buka tautan yang sudah kami kirimkan. Semua yang Anda perlukan sudah kami siapkan di sana.</p>
      <p className="welcome-note">Belum menerima tautan? Hubungi tim Werkudara yang mengundang Anda, kami dengan senang hati membantu.</p>
      <p className="welcome-en" lang="en">Welcome. If you are our guest, the link we sent you has everything ready for you.</p>
      <p className="welcome-sign">Salam hangat, Werkudara</p>
    </div>
  </main>;
}
