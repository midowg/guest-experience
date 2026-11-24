"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useT } from "@/components/main-wam/i18n";
import css from "./beranda.module.css";

export type SummaryKey = "kuis" | "misi" | "karbon" | "momen" | "mozaik";
export type SummaryCard = { key: SummaryKey; node: ReactNode };

/** The panels that actually hold a card (a card whose module is off or has no data renders nothing and its panel is empty). */
const shown = (el: HTMLElement) => (Array.from(el.children) as HTMLElement[]).filter(panel => panel.childElementCount > 0);
const leftOf = (el: HTMLElement, panel: HTMLElement) => Math.max(panel.offsetLeft - (el.clientWidth - panel.offsetWidth) / 2, 0);
const nearest = (el: HTMLElement) => {
  const middle = el.scrollLeft + el.clientWidth / 2;
  let best = 0;
  let gap = Infinity;
  shown(el).forEach((panel, index) => {
    const away = Math.abs(panel.offsetLeft + panel.offsetWidth / 2 - middle);
    if (away < gap) { gap = away; best = index; }
  });
  return best;
};

/**
 * Beranda's secondary cards (Kuis live while on, Misi, Jejak karbon, Momen, Mozaik) as ONE carousel: one card per
 * screen at about 90 % width with the edge of the next peeking in, one snap per card, no scrollbar, all as tall
 * as the tallest (the cards stretch). Under it one small segment per card (the one in view longer and gold; a tap
 * goes to that card, the arrow keys move along). A card that renders nothing (module off, no data) is left out
 * of the indicator (the panel is empty and hidden), and with one card left it is shown in full without an indicator.
 */
export function BerandaCarousel({ cards }: { cards: SummaryCard[] }) {
  const t = useT();
  const track = useRef<HTMLDivElement>(null);
  const dots = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [keys, setKeys] = useState<SummaryKey[]>(() => cards.map(card => card.key));
  const listed = cards.map(card => card.key).join(",");

  // Which cards really hold something: read from the DOM, and again when a streamed card arrives (or turns out empty).
  useLayoutEffect(() => {
    const el = track.current;
    if (!el) return;
    const read = () => {
      const next = (Array.from(el.children) as HTMLElement[]).filter(panel => panel.childElementCount > 0).map(panel => panel.dataset.card as SummaryKey);
      setKeys(prev => (prev.join(",") === next.join(",") ? prev : next));
    };
    read();
    const observer = new MutationObserver(read);
    observer.observe(el, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [listed]);

  const go = useCallback((index: number, smooth: boolean) => {
    const el = track.current;
    const panel = el ? shown(el)[index] : undefined;
    if (!el || !panel) return;
    const left = leftOf(el, panel);
    const calm = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (typeof el.scrollTo === "function") el.scrollTo({ left, behavior: smooth && !calm ? "smooth" : "auto" });
    else el.scrollLeft = left;
  }, []);

  useEffect(() => {
    const onResize = () => go(active, false);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [active, go]);

  const onScroll = () => {
    const el = track.current;
    if (el && el.clientWidth) setActive(nearest(el));
  };

  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    const buttons = Array.from(dots.current?.querySelectorAll("button") ?? []);
    const from = buttons.findIndex(button => button === document.activeElement);
    const to = Math.min(Math.max((from < 0 ? active : from) + step, 0), buttons.length - 1);
    event.preventDefault();
    buttons[to]?.focus();
    go(to, true);
  };

  const count = Math.min(keys.length, cards.length);
  const single = count < 2;
  const name = (key: SummaryKey) => t(`peserta.summary.${key}`);
  return <div className={css.summary}>
    <div ref={track} className={css.sumTrack} data-single={single ? "" : undefined} role="region" aria-label={t("peserta.summary.label")} onScroll={onScroll}>
      {cards.map(card => {
        const index = keys.indexOf(card.key);
        return <div key={card.key} className={css.sumPanel} data-card={card.key} role="group" aria-label={name(card.key)}
          aria-roledescription={single ? undefined : "slide"} aria-hidden={index === -1 ? true : undefined}>{card.node}</div>;
      })}
    </div>
    {!single && <div ref={dots} className={css.sumDots} role="group" aria-label={t("peserta.summary.indicator")} onKeyDown={onKey}>
      {keys.map((key, index) => <button key={key} type="button" className={css.sumDot} data-active={index === active ? "" : undefined}
        aria-current={index === active ? "true" : undefined} aria-label={`${name(key)} · ${t("peserta.summary.card", { n: index + 1, total: keys.length })}`}
        onClick={() => go(index, true)}><i aria-hidden /></button>)}
    </div>}
  </div>;
}
