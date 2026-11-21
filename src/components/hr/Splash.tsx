"use client";

import { useEffect, useState } from "react";
import { useCopy } from "./lang";
import { WgMark } from "./WgMark";
import styles from "./splash.module.css";

/*
 * WG People's splash (21 Nov 2026): the owner did not want Journey's loading page or a visible
 * loader when the app opens. One screen in the brand colour with the mark, the same as the phone's
 * own launch picture (manifest background on Android, startup images on iPhone), so opening reads
 * as one step: launch picture, this splash while the first screen is made, then the app.
 *
 * Two uses, one look:
 * - `SplashWait` (the /hr loading boundary): while the server makes the first screen, or the app
 *   right after signing in (`expectSplash`). It stays until the screen replaces it. Moving between
 *   the sign-in pages shows only the plain blue, no mark, so it does not read as the app restarting.
 * - `SplashCover` (in the frame and on the sign-in pages): drawn over a ready screen, it holds for a
 *   moment after the first paint and fades away, so the change from splash to app is soft. Once
 *   per page load: a screen opened later inside the app shows none, unless the full wait splash was
 *   just on screen (after signing in), which it then fades out.
 * Without JavaScript the cover still goes, by its own CSS timer (4 s); a page that becomes ready
 * after that does not bring it back. The mark is hidden from screen readers; while waiting they
 * hear "Memuat WG People".
 */

let covered = false;
let waited = false;
let arriving = false;

/** Before going into the app from a sign-in page: the next wait shows the full splash. */
export function expectSplash() { arriving = true; }

/** The mark alone, as on the phone's launch picture (public/hr/splash-*.png), so nothing jumps. */
function Face() {
  return <span className={styles.mark}><WgMark size={112} head="#FFFFFF" aria-hidden /></span>;
}

/** While the first screen is made: the splash, held. */
export function SplashWait() {
  const [full] = useState(() => !covered || arriving);
  const { t } = useCopy();
  useEffect(() => { if (full) { waited = true; arriving = false; } }, [full]);
  return <>
    <div className={`${styles.splash} ${styles.wait}`} aria-hidden>{full && <Face />}</div>
    <p className={styles.srOnly} role="status">{t.common.loadingApp}</p>
  </>;
}

/** Over a ready screen: holds briefly after the first paint, then fades; once per page load. */
export function SplashCover() {
  const [shown, setShown] = useState(() => !covered || waited);
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    if (!shown) return;
    const fresh = !covered;
    covered = true; waited = false;
    // Past the CSS timer the cover is already gone: take it away without fading it in again.
    const late = fresh && performance.now() > 3900;
    // A fresh load holds until about half a second after the page started; after a wait it fades at once.
    const hold = late ? 0 : fresh ? Math.max(0, 450 - performance.now()) : 0;
    const timer = window.setTimeout(() => (late ? setShown(false) : setLeaving(true)), hold);
    return () => window.clearTimeout(timer);
  }, [shown]);
  if (!shown) return null;
  return <div className={`${styles.splash} ${styles.cover}`} data-leaving={leaving || undefined} aria-hidden
    onAnimationEnd={event => { if (event.animationName.includes("leave")) setShown(false); }}>
    <Face />
  </div>;
}
