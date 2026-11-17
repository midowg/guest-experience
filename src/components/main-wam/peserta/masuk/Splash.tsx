"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { SPLASH_KEY, splashWait } from "@/lib/main-wam/peserta/splash";
import css from "../peserta.module.css";

/** Whether this page load shows the splash: decided once per load (StrictMode runs effects twice). */
let showThisLoad: boolean | undefined;
function firstTimeThisSession(): boolean {
  if (showThisLoad === undefined) {
    let seen = false;
    try { seen = window.sessionStorage.getItem(SPLASH_KEY) === "1"; window.sessionStorage.setItem(SPLASH_KEY, "1"); } catch { /* storage off: show it */ }
    showThisLoad = !seen;
  }
  return showThisLoad;
}

const noSubscription = () => () => undefined;

/**
 * O01 Splash, over Masuk while the page opens (mode semua): the event's colour with "WAM 2026",
 * its long name and dates, or Admin WAM's splash image (the theme's `splash` slot) when there is
 * one. It never holds sign-in up: Masuk is ready under it, a tap or a key lifts it, and it goes
 * after 0.7 s (at most 1.2 s, by CSS alone too, so a page without JavaScript is not stuck). Once
 * per browser session; not after an in-app navigation (it opens the app, not a page). Reduced
 * motion: no fade, it simply goes. Hidden from screen readers: Masuk is what they get at once.
 */
export function Splash({ title, subtitle, dates, image, hold }: {
  title: string;
  subtitle: string | null;
  dates: string;
  /** The theme has a splash image (drawn from --mw-image-splash, in place of the words). */
  image: boolean;
  /** Previews: stays, without the fade. */
  hold?: boolean;
}) {
  // True while hydrating the server's page (getServerSnapshot), false when first drawn on the client.
  const hydrating = useSyncExternalStore(noSubscription, () => false, () => true);
  const [opening] = useState(hydrating);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    if (hold || !opening) return;
    const timer = window.setTimeout(() => setGone(true), firstTimeThisSession() ? splashWait(performance.now()) : 0);
    const lift = () => setGone(true);
    window.addEventListener("keydown", lift, { once: true });
    return () => { window.clearTimeout(timer); window.removeEventListener("keydown", lift); };
  }, [hold, opening]);

  if ((!opening && !hold) || gone) return null;
  return <div className={`${css.splash} ${image ? css.splashImage : ""} ${hold ? css.splashHold : ""}`} aria-hidden data-testid="splash" onPointerDown={() => setGone(true)}>
    {!image && <>
      <div className={css.splashMark}>
        <span className={css.splashTitle}>{title}</span>
        {subtitle && <span className={css.splashSub}>{subtitle}</span>}
      </div>
      {dates && <p className={css.splashFoot}>{dates}</p>}
    </>}
  </div>;
}
