import Image from 'next/image';

/**
 * What the front page shows when no event is on air. Deliberately offers no route into the
 * management area: /admin is reached by typing it, and this is what a stranger sees.
 */
export function EmptyHome() {
  return <div className="site-shell">
    <header className="site-header"><div className="container">
      <span className="site-brand">
        <Image src="/werkudara_icon.png" alt="" width={35} height={40} />
        <span><strong>WERKUDARA</strong><span>Guest Experience</span></span>
      </span>
    </div></header>
    <main className="landing container"><div className="landing-inner">
      <p className="eyebrow">A thoughtful welcome</p>
      <h1>Setiap pertemuan,<br />dimulai dengan sambutan.</h1>
      <p>Selamat datang di Guest Experience Werkudara. Saat ini belum ada undangan yang sedang ditayangkan. Silakan buka tautan undangan dari penyelenggara, atau hubungi panitia acara Anda.</p>
    </div></main>
    <footer className="site-footer"><div className="container">Werkudara · Guest Experience</div></footer>
  </div>;
}
