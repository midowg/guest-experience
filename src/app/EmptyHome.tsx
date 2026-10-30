import Image from 'next/image';

/**
 * The front page of Werkudara Journey: a plain welcome. It says nothing about what the guest pages
 * hold, links to none of them, and offers no route into the management area. Only people given a
 * link know what is behind it.
 */
export function EmptyHome() {
  return <div className="site-shell">
    <header className="site-header"><div className="container">
      <span className="site-brand">
        <Image src="/werkudara_icon.png" alt="" width={35} height={40} />
        <span><strong>WERKUDARA</strong><span>Journey</span></span>
      </span>
    </div></header>
    <main className="landing container">
      <section className="landing-inner" aria-labelledby="home-title">
        <p className="eyebrow">Werkudara Journey</p>
        <h1 id="home-title">Setiap pertemuan,<br />dimulai dengan sambutan.</h1>
        <p>Werkudara Journey menemani tamu kami di setiap pertemuan. Silakan buka tautan yang Anda terima dari tim Werkudara.</p>
        <p className="landing-en" lang="en">Welcome to Werkudara Journey. Please open the link you received from the Werkudara team.</p>
      </section>
    </main>
    <footer className="site-footer"><div className="container">Werkudara · Journey</div></footer>
  </div>;
}
