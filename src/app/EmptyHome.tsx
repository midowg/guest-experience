import Image from 'next/image';

/**
 * The front page of Werkudara Journey: one full screen that greets whoever arrives. It says
 * nothing about what the guest pages hold and links to none of them; guests come in through the
 * link the team sent them.
 */
export function EmptyHome() {
  return <main className="welcome-page">
    <div className="welcome-main">
      <span className="welcome-logo"><Image src="/werkudara_icon.png" alt="Werkudara Group" width={40} height={46} priority /></span>
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
  </main>;
}
