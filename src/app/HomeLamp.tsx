'use client';

import Image from 'next/image';
import { useEffect, useRef, type CSSProperties, type PointerEvent } from 'react';
import { ArrowRight, Lock } from 'lucide-react';
import { doorIcons, type Door } from './home-doors';
import { SchemeSwitch } from './SchemeSwitch';
import css from './lamp.module.css';

const PHOTO = '/panduan-ke-werkudara/assets/garden-960.webp';

/**
 * The front page's second look, "Lampu" (26 Nov 2026): a dark screen where the mouse is a lamp over
 * the joglo in the office garden; the title rises letter by letter; the apps sit in a dock that
 * grows under the mouse and tells what each app is for. With no mouse (a phone) the lamp wanders on
 * its own and the dock shows each app's name. Dark unless the visitor picks light; motion stops with
 * "reduce motion".
 */
export function HomeLamp({ doors, guest }: { doors: Door[]; guest: string }) {
  const root = useRef<HTMLElement>(null);
  const moved = useRef(false);

  function aim(x: number, y: number) {
    root.current?.style.setProperty('--x', `${x}px`);
    root.current?.style.setProperty('--y', `${y}px`);
  }
  function move(event: PointerEvent<HTMLElement>) {
    if (event.pointerType !== 'mouse') return;
    moved.current = true;
    const box = event.currentTarget.getBoundingClientRect();
    aim(event.clientX - box.left, event.clientY - box.top);
  }
  // Without a mouse the lamp drifts slowly across the photo, so a phone sees the joglo too.
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    let frame = 0;
    const start = performance.now();
    const wander = (now: number) => {
      const box = root.current?.getBoundingClientRect();
      if (box && !moved.current) {
        const t = (now - start) / 1000;
        aim(box.width * (.5 + .32 * Math.sin(t * .35)), box.height * (.38 + .16 * Math.sin(t * .53 + 1)));
      }
      frame = requestAnimationFrame(wander);
    };
    frame = requestAnimationFrame(wander);
    return () => cancelAnimationFrame(frame);
  }, []);

  return <main ref={root} className={css.page} data-lamp="" onPointerMove={move}>
    <Image src={PHOTO} alt="" fill priority sizes="100vw" className={css.photo} />
    <div className={css.shade} aria-hidden="true" />
    <header className={css.top}><SchemeSwitch start="dark" /></header>

    <div className={css.head}>
      <span className={css.crest} role="img" aria-label="Werkudara Group" style={{ viewTransitionName: "wk-crest" }} />
      <p className={css.kicker}>Selamat datang</p>
      <h1 className={css.mark} aria-label="Journey" style={{ viewTransitionName: "wk-title" }}>{'Journey'.split('').map((letter, index) =>
        <span key={index} style={{ '--i': index } as CSSProperties} aria-hidden="true">{letter}</span>)}</h1>
      <p className={css.by}>by Werkudara Group</p>
    </div>

    <nav className={css.dock} aria-label="Pilih aplikasi">{doors.map((door, index) => {
      const Icon = doorIcons[door.icon];
      return <a key={door.href} href={door.href} className={css.app} style={{ '--tone': door.tone, '--i': index } as CSSProperties}>
        <span className={css.tile} aria-hidden="true">
          {door.logo ? <Image src={door.logo} alt="" width={64} height={64} unoptimized /> : <Icon size={26} />}
        </span>
        <span className={css.label}>{door.name}</span>
        <span className={css.tip} role="tooltip">
          <span className={css.tipWhat}>{door.what}</span>
          <strong>{door.name}</strong>
          <span className={css.tipText}>{door.description}</span>
          <span className={css.tipFoot}><span><Lock size={12} aria-hidden="true" /> {door.key}</span><span>Buka <ArrowRight size={14} aria-hidden="true" /></span></span>
        </span>
      </a>;
    })}</nav>

    <footer className={css.guest}>
      <p>{guest}</p>
      <p lang="en">Welcome. If you are our guest, the link we sent you has everything ready for you.</p>
    </footer>
  </main>;
}
