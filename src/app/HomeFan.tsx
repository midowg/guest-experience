'use client';

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { ArrowRight, CalendarDays, DoorOpen, HeartPulse, LayoutDashboard, Lock, MonitorPlay } from 'lucide-react';
import { SchemeSwitch } from './SchemeSwitch';
import css from './home.module.css';

export type Door = {
  href: string; icon: keyof typeof icons; tone: string; name: string; what: string; key: string; description: string;
};
const icons = { wam: CalendarDays, wlm: HeartPulse, booking: DoorOpen, signage: MonitorPlay, admin: LayoutDashboard };

/**
 * The front page's doors as a fan of 3D cards over a moving colour mesh; on a wide screen the fan
 * tilts toward the mouse. On a phone the fan is a swipeable cover flow: the middle card faces the
 * reader and glows, the others turn away. Motion stops with "reduce motion".
 */
export function HomeFan({ doors, guest }: { doors: Door[]; guest: string }) {
  const stage = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  function tilt(event: PointerEvent<HTMLElement>) {
    if (event.pointerType !== 'mouse') return;
    const box = event.currentTarget.getBoundingClientRect();
    stage.current?.style.setProperty('--rx', `${((event.clientY - box.top) / box.height - .5) * -12}deg`);
    stage.current?.style.setProperty('--ry', `${((event.clientX - box.left) / box.width - .5) * 20}deg`);
  }
  // Each card's distance from the middle of the strip (-1 left … 1 right), read by the phone layout.
  function flow() {
    const strip = stage.current;
    if (!strip) return;
    const middle = strip.scrollLeft + strip.clientWidth / 2;
    let nearest = 0, best = Infinity;
    strip.querySelectorAll<HTMLElement>('[data-card]').forEach((card, index) => {
      const offset = (card.offsetLeft + card.offsetWidth / 2 - middle) / card.offsetWidth;
      const d = Math.max(-1.5, Math.min(1.5, offset));
      card.style.setProperty('--d', d.toFixed(3));
      card.style.setProperty('--ad', Math.abs(d).toFixed(3));
      card.style.zIndex = String(10 - Math.round(Math.abs(d) * 4));
      if (Math.abs(offset) < best) { best = Math.abs(offset); nearest = index; }
    });
    setActive(nearest);
  }
  useEffect(() => {
    // A phone opens on the first app, whatever scroll the browser remembers.
    if (stage.current) stage.current.scrollLeft = 0;
    flow();
    window.addEventListener('resize', flow);
    return () => window.removeEventListener('resize', flow);
  }, []);
  function go(index: number) {
    stage.current?.querySelectorAll<HTMLElement>('[data-card]')[index]?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }

  return <main className={css.page} data-front="" onPointerMove={tilt}>
    <div className={css.mesh} aria-hidden="true"><span /><span /><span /><span /></div>
    <span className={css.watermark} aria-hidden="true" />
    <header className={css.top}>
      <span className={css.brand}><span className={css.logo} role="img" aria-label="Logo Werkudara" />Werkudara Group</span>
      <SchemeSwitch />
    </header>

    <div className={css.head}>
      <p className={css.kicker}>Selamat datang</p>
      <h1 className={css.mark}>Journey</h1>
      <p className={css.by}>by Werkudara Group</p>
    </div>

    <nav aria-labelledby="doors-title" className={css.doors}>
      <h2 id="doors-title" className={css.srOnly}>Pilih aplikasi</h2>
      <div className={css.fan} ref={stage} onScroll={() => requestAnimationFrame(flow)}>{doors.map((door, index) => {
        const Icon = icons[door.icon];
        return <a key={door.href} data-card href={door.href} className={css.card} style={{ '--tone': door.tone, '--n': index - (doors.length - 1) / 2 } as CSSProperties}>
          <span className={css.glow} aria-hidden="true" />
          <span className={css.icon} aria-hidden="true"><Icon size={28} /></span>
          <span className={css.what}>{door.what}</span>
          <strong className={css.name}>{door.name}</strong>
          <span className={css.description}>{door.description}</span>
          <span className={css.foot}><span><Lock size={12} aria-hidden="true" /> {door.key}</span><ArrowRight size={18} aria-hidden="true" className={css.arrow} /></span>
        </a>;
      })}</div>
      <div className={css.dots}>{doors.map((door, index) =>
        <button key={door.href} type="button" aria-label={`Ke ${door.name}`} aria-current={active === index || undefined} onClick={() => go(index)} style={{ '--tone': door.tone } as CSSProperties} />)}</div>
      <p className={css.swipe} aria-hidden="true">Geser untuk memilih aplikasi</p>
    </nav>

    <footer className={css.guest}>
      <p>{guest}</p>
      <p lang="en">Welcome. If you are our guest, the link we sent you has everything ready for you.</p>
    </footer>
  </main>;
}
