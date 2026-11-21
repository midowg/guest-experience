"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ChevronRight } from "lucide-react";
import { SPLASH_KEY } from "@/lib/main-wam/peserta/splash";
import { useT } from "@/components/main-wam/i18n";
import { quietFocus } from "@/components/main-wam/ui/useModal";
import { PegasusArt } from "./PegasusArt";
import css from "./masuk.module.css";

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
 * O01 Splash, over Masuk when the app opens (mode semua): always dark, the pegasus of dots with its
 * gold path, a pill with the event's name, dates and place, "Shaping for tomorrow" (the last word in
 * gold), "Werkudara Annual Meeting" and the Masuk button, which lifts it onto the sign-in beneath
 * (that is already there and ready). Or Admin WAM's splash image (the theme's `splash` slot) in place
 * of the art and words, with the same button. Once per browser session; not after an in-app
 * navigation (it opens the app, not a page). It is a labelled region with a real button (focus starts
 * on it), so a screen reader meets Masuk at once. While it is up, the page beneath (the sign-in, a
 * sibling) is `inert`: no Tab, no tap and no screen reader reaches it, so there is one heading at a
 * time and nothing to type into behind the art. If the script never runs, the splash gives up by
 * itself (css `splashGiveUp`, cleared here once hydrated) and the sign-in stays usable.
 */
export function Splash({ title, subtitle, dates, venue, image, hold }: {
  title: string;
  /** "Werkudara Annual Meeting 2026" (null: the words alone). */
  subtitle: string | null;
  dates: string;
  /** "Kota Batu"; "" = none. */
  venue?: string;
  /** The theme has a splash image (drawn from --mw-image-splash, in place of the art and words). */
  image: boolean;
  /** Previews: stays even without a tap target being needed (the same as the page). */
  hold?: boolean;
}) {
  const t = useT();
  // True while hydrating the server's page (getServerSnapshot), false when first drawn on the client.
  const hydrating = useSyncExternalStore(noSubscription, () => false, () => true);
  const [opening] = useState(hydrating);
  const [gone, setGone] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const region = useRef<HTMLElement>(null);
  const visible = !((!opening && !hold) || gone);

  useEffect(() => {
    if (hold || !opening) return;
    // Not the first page of this browser session: straight to Masuk, nothing to hold.
    if (!firstTimeThisSession()) { setGone(true); return; } // eslint-disable-line react-hooks/set-state-in-effect -- read from the browser after the first paint
  }, [hold, opening]);
  useEffect(() => { if (button.current && (hold || opening)) quietFocus(button.current); }, [hold, opening]);
  // The script is running: the splash waits for the tap, and what is beneath it is out of reach meanwhile.
  useEffect(() => {
    const own = region.current;
    if (!visible || !own) return;
    own.style.animation = "none";
    const beneath = Array.from(own.parentElement?.children ?? []).filter((node): node is HTMLElement => node !== own && node instanceof HTMLElement);
    for (const node of beneath) node.inert = true;
    return () => { for (const node of beneath) node.inert = false; };
  }, [visible]);

  if (!visible) return null;
  const words = t("peserta.splash.tagline").split(" ");
  const last = words.pop();
  const line = [title, dates, venue].filter(Boolean).join(" · ");
  return <section ref={region} className={`${css.splash} ${image ? css.splashImage : ""}`} data-testid="splash" aria-label={title}>
    {!image && <PegasusArt className={css.splashPeg} />}
    <div className={css.splashBody}>
      {!image && <>
        {line && <span className={css.splashPill}>{line}</span>}
        <h1 className={css.splashTitle}>{words.join(" ")} <span className={css.splashGold}>{last}</span></h1>
        <p className={css.splashCap}>{subtitle ?? t("peserta.splash.caption")}</p>
      </>}
      <button ref={button} type="button" className={css.goldButton} onClick={() => setGone(true)}>{t("peserta.login.title")}<ChevronRight aria-hidden /></button>
    </div>
  </section>;
}
