"use client";

import { Children, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import css from "./agenda-carousel.module.css";

/**
 * Beranda's agenda as a carousel (9 Nov 2026): one card per item in time order, opening on the one
 * that matters now (`start`: running or next). Earlier ones (yesterday too) are a swipe to the
 * left, later ones to the right; the next card peeks in on a phone so the swipe is obvious. On a
 * desktop ‹ › step through. "3 dari 12" says where one is. Native scrolling with snap points, so
 * it follows the finger, a trackpad and the keyboard without any extra code.
 */
export function AgendaCarousel({ start, labels, title = "Agenda", action, children }: {
  start: number; labels: string[]; title?: string; action?: ReactNode; children: ReactNode;
}) {
  const slides = Children.toArray(children);
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(start);

  const slideAt = (at: number) => track.current?.children[at] as HTMLElement | undefined;
  function go(at: number, smooth = true) {
    const node = track.current, slide = slideAt(at);
    if (!node || !slide) return;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    node.scrollTo({ left: slide.offsetLeft - node.offsetLeft, behavior: smooth && !reduce ? "smooth" : "auto" });
  }
  // Open on the card that matters now, without an animation.
  useEffect(() => { go(start, false); }, [start]); // eslint-disable-line react-hooks/exhaustive-deps -- once per starting card
  function onScroll() {
    const node = track.current;
    if (!node) return;
    let nearest = 0, distance = Infinity;
    Array.from(node.children).forEach((child, at) => {
      const gap = Math.abs((child as HTMLElement).offsetLeft - node.offsetLeft - node.scrollLeft);
      if (gap < distance) { distance = gap; nearest = at; }
    });
    setIndex(nearest);
  }

  return <section className={css.carousel} aria-roledescription="carousel" aria-labelledby="agenda-judul" id="agenda">
    <div className={css.head}>
      <h2 id="agenda-judul">{title}</h2>
      <span className={css.count} aria-live="polite">{index + 1} dari {slides.length}</span>
      {action}
      <div className={css.nav}>
        <button type="button" className={css.arrow} onClick={() => go(index - 1)} disabled={index <= 0} aria-label="Agenda sebelumnya"><ChevronLeft aria-hidden /></button>
        <button type="button" className={css.arrow} onClick={() => go(index + 1)} disabled={index >= slides.length - 1} aria-label="Agenda berikutnya"><ChevronRight aria-hidden /></button>
      </div>
    </div>
    <div ref={track} className={css.track} onScroll={onScroll} tabIndex={0} aria-label="Geser untuk agenda lain">
      {slides.map((slide, at) => <div key={at} className={css.slide} role="group" aria-roledescription="slide" aria-label={`${at + 1} dari ${slides.length}: ${labels[at] ?? ""}`}>{slide}</div>)}
    </div>
  </section>;
}
