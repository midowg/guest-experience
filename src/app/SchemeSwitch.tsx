'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

const KEY = 'wk_scheme';

/**
 * Light or dark for the front page. It starts from the visitor's system setting; a choice made
 * here is kept on this device (data-scheme on <html>, read by the front page's styles).
 */
export function SchemeSwitch() {
  const [dark, setDark] = useState<boolean | null>(null);
  useEffect(() => {
    let saved: string | null = null;
    try { saved = window.localStorage.getItem(KEY); } catch { /* storage blocked: follow the system */ }
    const system = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
    const next = saved === 'dark' ? true : saved === 'light' ? false : system;
    if (saved === 'dark' || saved === 'light') document.documentElement.dataset.scheme = saved;
    // Reading the device's setting after hydration; the server cannot know it.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDark(next);
  }, []);
  function toggle() {
    const next = !dark;
    setDark(next);
    const scheme = next ? 'dark' : 'light';
    document.documentElement.dataset.scheme = scheme;
    try { window.localStorage.setItem(KEY, scheme); } catch { /* not kept, still switched */ }
  }
  return <button type="button" role="switch" aria-checked={dark ?? false} aria-label="Mode gelap" className="welcome-scheme" onClick={toggle} disabled={dark === null}>
    <Sun size={16} aria-hidden="true" />
    <span className="welcome-scheme-knob" aria-hidden="true" />
    <Moon size={16} aria-hidden="true" />
  </button>;
}
