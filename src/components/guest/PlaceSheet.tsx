"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Info, MapPin, X } from "lucide-react";
import type { AgendaDetail, PlainImage } from "@/lib/types";
import { imageSrcSet } from "./Gallery";
import { PhotoZoom } from "./PhotoZoom";
import { useWording } from "./language";
import styles from "./guest.module.css";

/** True while a closed sheet's step back in history is on its way (PlaceSheet). */
let backPending = false;
if (typeof window !== "undefined") window.addEventListener("popstate", () => { backPending = false; });

/** The detail's photos in order: the main photo, then the extra ones. */
export function highlightPhotos(detail: AgendaDetail | undefined): PlainImage[] {
  return [detail?.photo, ...(detail?.photos ?? [])].filter((photo): photo is PlainImage => !!photo?.url);
}

/** A place highlight: anything beyond the words of "Tahukah Anda?" opens as a sheet instead of in place. */
export function isHighlight(detail: AgendaDetail | undefined): boolean {
  return !!detail && !!(highlightPhotos(detail).length || detail.points?.length || detail.note?.trim());
}

/**
 * Photos one after another: swiped on a phone, with arrows and "2 of 4" beside them. One photo is
 * shown on its own. Each photo opens full size (PhotoZoom).
 */
export function PhotoCarousel({ photos }: { photos: PlainImage[] }) {
  const { t } = useWording();
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  if (!photos.length) return null;
  if (photos.length === 1) return <PhotoZoom image={photos[0]} className={styles.carouselSlide} sizes="(max-width: 720px) 100vw, 32rem" />;
  const go = (to: number) => {
    const box = track.current;
    if (!box) return;
    const next = Math.max(0, Math.min(photos.length - 1, to));
    box.scrollTo({ left: next * box.clientWidth, behavior: "smooth" });
  };
  return <div className={styles.carousel}>
    <div ref={track} className={styles.carouselTrack} onScroll={event => { const box = event.currentTarget; setIndex(Math.round(box.scrollLeft / Math.max(1, box.clientWidth))); }}>
      {photos.map((photo, at) => <PhotoZoom key={`${photo.url}-${at}`} image={photo} className={styles.carouselSlide} sizes="(max-width: 720px) 100vw, 32rem" />)}
    </div>
    <div className={styles.carouselBar}>
      <button type="button" onClick={() => go(index - 1)} disabled={index === 0} aria-label={t("photo.prev")}><ChevronLeft size={18} aria-hidden="true" /></button>
      <span aria-live="polite">{t("photo.count", { n: index + 1, total: photos.length })}</span>
      <button type="button" onClick={() => go(index + 1)} disabled={index === photos.length - 1} aria-label={t("photo.next")}><ChevronRight size={18} aria-hidden="true" /></button>
    </div>
  </div>;
}

/** The highlight's words and photos, the same in the sheet and on the printed E-Guide. */
export function HighlightBody({ detail, eyebrow, heading }: { detail: AgendaDetail; eyebrow: ReactNode; heading: string }) {
  const { t } = useWording();
  const points = detail.points ?? [];
  return <>
    <PhotoCarousel photos={highlightPhotos(detail)} />
    <p className={styles.placeEyebrow}>{eyebrow}</p>
    <h3 className={styles.placeTitle}>{heading}</h3>
    {detail.teaser.trim() && <p className={styles.placeLead}>{detail.teaser}</p>}
    {detail.did_you_know.trim() && <p className={styles.multiline}>{detail.did_you_know}</p>}
    {detail.more_story.trim() && <p className={styles.multiline}>{detail.more_story}</p>}
    {points.length > 0 && <div>
      {detail.points_title?.trim() && <p className={styles.placeSubhead}>{detail.points_title}</p>}
      <ul className={styles.placePoints}>{points.map((point, at) => <li key={at}>
        <ChevronRight size={16} aria-hidden="true" />
        <span>{point.title && <strong>{/[.!?:]$/.test(point.title) ? point.title : `${point.title}.`}</strong>}{point.title && point.text && " "}{point.text}</span>
      </li>)}</ul>
    </div>}
    {detail.note?.trim() && <div className={styles.placeNote}>
      <Info size={18} aria-hidden="true" />
      <p>{detail.note_title?.trim() && <strong>{detail.note_title}. </strong>}{detail.note}</p>
    </div>}
    {detail.maps_url && <div className={styles.tripActions}><a href={detail.maps_url} target="_blank" rel="noopener noreferrer"><MapPin size={16} aria-hidden="true" /> {t("detail.map")}<span className="sr-only"> {heading} {t("common.newTab")}</span></a></div>}
  </>;
}

/**
 * A place highlight that opens from its row: a sheet rising from the bottom on a phone, a panel on
 * the right on a wide screen. Esc, the close button, a tap outside or the phone's back button close
 * it, and focus returns to the row. `trigger` draws the row's opener; `open` is passed to it.
 */
export function PlaceSheet({ detail, eyebrow, heading, trigger }: { detail: AgendaDetail; eyebrow: ReactNode; heading: string; trigger: (open: () => void) => ReactNode }) {
  const { t } = useWording();
  const dialog = useRef<HTMLDialogElement>(null);
  const anchor = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(false);
  // The sheet lives outside the schedule (whose list styles would reach into it) but inside the
  // event page, so the theme's colours and fonts still apply. Found once the row is on the page.
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => { setHost(anchor.current?.closest<HTMLElement>(`.${styles.experience}`) ?? document.body); }, []);
  // The history step this opening added: the phone's back button then closes the sheet instead of
  // leaving the page. Each opening has its own mark, so an older step is never taken back by mistake.
  const step = useRef("");
  // Opening only asks; the dialog itself opens once rendered with its content.
  useEffect(() => {
    const box = dialog.current;
    if (!shown || !box) return;
    const onPop = () => { if (typeof box.close === "function") box.close(); };
    const start = () => {
      if (!box.open) {
        if (typeof box.showModal === "function") box.showModal(); else box.setAttribute("open", "");
        document.documentElement.classList.add(styles.placeLocked);
        step.current = `${Date.now()}-${Math.random()}`;
        // A step left by a sheet that is already closed is reused rather than stacked on.
        const state = { ...window.history.state, journeySheet: step.current };
        if (window.history.state?.journeySheet) window.history.replaceState(state, ""); else window.history.pushState(state, "");
      }
      window.addEventListener("popstate", onPop);
    };
    // Another sheet just closed and its step back has not landed yet: wait for it, or that step
    // would close this sheet the moment it opens.
    if (!backPending) { start(); return () => window.removeEventListener("popstate", onPop); }
    const later = () => { window.removeEventListener("popstate", later); start(); };
    window.addEventListener("popstate", later);
    return () => { window.removeEventListener("popstate", later); window.removeEventListener("popstate", onPop); };
  }, [shown]);
  const open = () => setShown(true);
  const onClose = () => {
    // Another sheet may already be open (its close event can come after the next one opened).
    if (!document.querySelector(`dialog[open].${styles.placeSheet}`)) document.documentElement.classList.remove(styles.placeLocked);
    setShown(false);
    // Closed by its own button, Esc or a tap outside: take back the history step it added.
    if (step.current && window.history.state?.journeySheet === step.current) { backPending = true; window.history.back(); }
    step.current = "";
  };
  const close = () => { const box = dialog.current; if (!box) return; if (typeof box.close === "function") box.close(); else { box.removeAttribute("open"); onClose(); } };
  const sheet = <dialog ref={dialog} className={styles.placeSheet} aria-label={heading} onClose={onClose} onClick={event => { if (event.target === event.currentTarget) close(); }}>
    <div className={styles.placePanel}>
      <div className={styles.placeTop}>
        <span className={styles.placeGrip} aria-hidden="true" />
        <button type="button" className={styles.placeClose} onClick={close}><X size={18} aria-hidden="true" /><span>{t("detail.sheetClose")}</span></button>
      </div>
      <div className={styles.placeBody}>
        {shown && <HighlightBody detail={detail} eyebrow={eyebrow} heading={heading} />}
      </div>
    </div>
  </dialog>;
  return <>
    {trigger(open)}
    <span ref={anchor} style={{ display: "none" }} />
    {host && createPortal(sheet, host)}
  </>;
}

/** The small picture in the row, for a highlight: it opens the sheet rather than the photo. */
export function HighlightThumb({ image, label, onOpen }: { image: PlainImage; label: string; onOpen: () => void }) {
  return <button type="button" className={`${styles.zoomThumb} ${styles.agendaThumb}`} onClick={onOpen} aria-label={label}>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={image.url} {...imageSrcSet(image.srcset, "8rem")} alt="" loading="lazy" referrerPolicy="no-referrer" />
  </button>;
}
