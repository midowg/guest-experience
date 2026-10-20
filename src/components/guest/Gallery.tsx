"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import type { EventRecord, GalleryImage, ImageSource } from "@/lib/types";
import styles from "./guest.module.css";
import { useWording } from "./language";

const INTERVAL = 6000;
/** The carousel sits in the wide column of the section grid; below that breakpoint it spans the screen. */
const GALLERY_SIZES = "(max-width: 960px) 100vw, 852px";

/**
 * Served variants describe themselves by width. A photo pasted from an external link has no
 * variants, which is legitimate: the attributes are then omitted so the `src` renders exactly
 * as before. Lives here because `Gallery` is the lowest module that needs it; the hero imports it.
 */
export function imageSrcSet(sources: ImageSource[], sizes: string): { srcSet?: string; sizes?: string } {
  // Duplicate widths make a candidate list invalid, so the first of each width wins.
  const byWidth = new Map<number, string>();
  for (const source of sources) {
    if (!source.url || !Number.isFinite(source.width) || source.width <= 0) continue;
    // Commas and spaces are the candidate-list separators: a url holding either cannot be
    // expressed here, and a malformed list makes the browser drop every candidate. Skipping
    // it leaves the plain `src` to load, which is a worse photo but never a broken one.
    if (/[\s,]/.test(source.url)) continue;
    if (!byWidth.has(source.width)) byWidth.set(source.width, source.url);
  }
  if (byWidth.size === 0) return {};
  const candidates = [...byWidth.entries()].sort(([a], [b]) => a - b).map(([width, url]) => `${url} ${width}w`);
  return { srcSet: candidates.join(", "), sizes };
}

/** Only the gallery supplies location photos; legacy standalone fields are retained as data only. */
export function venuePhotos(event: Pick<EventRecord, "gallery">): GalleryImage[] {
  return [...event.gallery].sort((a, b) => a.sort_order - b.sort_order);
}

/**
 * A single image renders as a plain figure — there is nothing to slide between.
 * Two or more advance on their own, and stop as soon as the viewer takes over.
 */
export function Gallery({ images, label }: { images: GalleryImage[]; label?: string }) {
  const { t } = useWording();
  label ??= t("gallery.label");
  const slides = [...images].sort((a, b) => a.sort_order - b.sort_order);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [reduced, setReduced] = useState(true);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  const total = slides.length;
  const go = useCallback((next: number) => setIndex(((next % total) + total) % total), [total]);

  useEffect(() => {
    if (total < 2 || !playing || reduced) return;
    const timer = window.setInterval(() => setIndex(current => (current + 1) % total), INTERVAL);
    return () => window.clearInterval(timer);
  }, [total, playing, reduced]);

  if (total === 0) return null;
  if (total === 1) {
    const [only] = slides;
    return <figure className={styles.galleryFigure}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={only.url} {...imageSrcSet(only.srcset, GALLERY_SIZES)} alt={only.alt} loading="lazy" referrerPolicy="no-referrer" />
      {only.caption && <figcaption>{only.caption}</figcaption>}
    </figure>;
  }

  function takeOver(move: () => void) {
    setPlaying(false);
    move();
  }

  return <section className={styles.gallery} aria-roledescription="carousel" aria-label={label}>
    <div className={styles.galleryViewport}>
      {slides.map((slide, position) => <figure
        key={slide.id}
        className={styles.gallerySlide}
        aria-hidden={position !== index}
        inert={position !== index}
        aria-roledescription="slide"
        aria-label={t("gallery.position", { n: position + 1, total })}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={slide.url} {...imageSrcSet(slide.srcset, GALLERY_SIZES)} alt={slide.alt} loading={position === 0 ? "eager" : "lazy"} referrerPolicy="no-referrer" />
        {slide.caption && <figcaption>{slide.caption}</figcaption>}
      </figure>)}
    </div>
    <div className={styles.galleryControls}>
      <button type="button" className={styles.galleryArrow} onClick={() => takeOver(() => go(index - 1))} aria-label={t("gallery.prev")}><ChevronLeft size={20} aria-hidden="true" /></button>
      <div className={styles.galleryDots} role="tablist" aria-label={t("gallery.pick")}>
        {slides.map((slide, position) => <button
          key={slide.id}
          type="button"
          role="tab"
          aria-selected={position === index}
          aria-label={t("gallery.photo", { n: position + 1 })}
          className={position === index ? styles.galleryDotActive : styles.galleryDot}
          onClick={() => takeOver(() => go(position))}
        />)}
      </div>
      <button type="button" className={styles.galleryArrow} onClick={() => takeOver(() => go(index + 1))} aria-label={t("gallery.next")}><ChevronRight size={20} aria-hidden="true" /></button>
      {!reduced && <button type="button" className={styles.galleryArrow} onClick={() => setPlaying(current => !current)} aria-label={playing ? t("gallery.pause") : t("gallery.play")}>
        {playing ? <Pause size={18} aria-hidden="true" /> : <Play size={18} aria-hidden="true" />}
      </button>}
    </div>
    {/* `alt` is optional now: an empty one means a decorative photo, so nothing is invented for it. */}
    <p className="sr-only" role="status">Foto {index + 1} dari {total}.{slides[index].alt && ` ${slides[index].alt}`}</p>
  </section>;
}
