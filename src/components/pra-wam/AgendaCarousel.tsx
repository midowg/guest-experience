"use client";

import { Children, useEffect, useRef, useState, type ReactNode } from "react";
import css from "./agenda-carousel.module.css";

/**
 * Beranda's agenda as a carousel (9 Nov 2026): one card per item in time order, opening on the one
 * that matters now (`start`: running or next). Earlier ones (yesterday too) are a swipe to the
 * left, later ones to the right. Each card is full width; a soft shadow on the left or right edge
 * shows there is more that way. Above it only three dots (9 Nov 2026): the lit one says where one
 * is, and a dot beside it steps that way (the way through on a desktop). Native scrolling with
 * snap points, so it follows the finger, a trackpad and the keyboard without any extra code.
 */
export function AgendaCarousel({ start, labels, title = "Agenda", children }: {
  start: number; labels: string[]; title?: string; children: ReactNode;
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

  // Three dots, turning like a wheel: the lit one is the middle while there are cards both ways,
  // the left one on the first card and the right one on the last (fewer dots for fewer cards).
  const dots = Math.min(slides.length, 3);
  const lit = index <= 0 ? 0 : index >= slides.length - 1 ? dots - 1 : 1;
  const stepFor = (dot: number) => dot === lit ? 0 : dots === 2 ? (dot === 0 ? -1 : 1) : dot - lit;

  return <section className={css.carousel} aria-roledescription="carousel" aria-labelledby="agenda-judul" id="agenda">
    <h2 id="agenda-judul" className="sr-only">{title}</h2>
    <p className="sr-only" aria-live="polite">{index + 1} dari {slides.length}</p>
    {dots > 1 && <div className={css.dots} role="group" aria-label="Pindah agenda">
      {Array.from({ length: dots }, (_, dot) => {
        const step = stepFor(dot);
        return <button key={dot} type="button" className={css.dot} aria-current={step === 0 ? "true" : undefined} disabled={step === 0}
          aria-label={step === 0 ? `Agenda ${index + 1} dari ${slides.length}` : step === -1 ? "Agenda sebelumnya" : step === 1 ? "Agenda berikutnya" : step < 0 ? "Mundur dua agenda" : "Maju dua agenda"}
          onClick={() => go(index + step)} />;
      })}
    </div>}
    <div className={css.frame} data-before={index > 0 ? "" : undefined} data-after={index < slides.length - 1 ? "" : undefined}>
      <div ref={track} className={css.track} onScroll={onScroll} tabIndex={0} aria-label="Geser untuk agenda lain">
        {slides.map((slide, at) => <div key={at} className={css.slide} role="group" aria-roledescription="slide" aria-label={`${at + 1} dari ${slides.length}: ${labels[at] ?? ""}`}>{slide}</div>)}
      </div>
    </div>
  </section>;
}
