"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { Ellipsis, Lock } from "lucide-react";
import { useLang, useT } from "@/components/main-wam/i18n";
import { Avatar, IconButton, Pill, PhotoFill } from "@/components/main-wam/ui";
import { HEART, type ReactionCount } from "@/lib/main-wam/momen/reactions";
import { photoAlt, photoMeta, swipeDecision, TAP_SLOP } from "@/lib/main-wam/momen/stack";
import type { FeedPhoto } from "@/lib/main-wam/momen/types";
import { ReactionPills } from "./Reactions";
import { useFreshAddress } from "./useFreshAddress";
import css from "./momen.module.css";

/*
 * The swipe stack (RISET §4): Pointer Events on the front card with touch-action: pan-y (the page
 * keeps vertical scrolling, the card takes sideways moves), pointer capture only once a move is a
 * swipe (so a tap still reaches the side buttons), pointercancel puts the card back. At most three
 * cards in the page; the next large photo is fetched ahead. Swipe left = next, right = previous; one
 * tap on a side does the same (WCAG 2.5.1, 2.5.7), and the arrow keys when the stack has focus.
 * Inside the front card: the owner's pill and the photo's options on top, the reactions it got as small
 * pills at the bottom left (a tap on one reacts with it, on another person's photo). Reduced motion: no throw or tilt, the next photo fades in.
 */

const tone = (id: string) => ((parseInt(id.replace(/[^0-9a-f]/gi, "").slice(-4) || "0", 16) % 6) + 1) as 1 | 2 | 3 | 4 | 5 | 6;
const reducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * The picture of a card: the small copy at once, the large one over it when it has loaded. The
 * addresses are short-lived (the large one 10–15 minutes, audit L5): when one has run out (the
 * stack left open a while), it is fetched once more through the server, which signs a fresh one.
 */
function CardPhoto({ photo, large, alt }: { photo: FeedPhoto; large: boolean; alt: string }) {
  const [loaded, setLoaded] = useState<string | null>(null);
  const small = useFreshAddress(photo.id, "kecil", photo.src.kecil);
  const big = useFreshAddress(photo.id, "besar", large ? photo.src.besar : null);
  return <>
    <PhotoFill tone={tone(photo.id)} className={css.fill} />
    {/* eslint-disable-next-line @next/next/no-img-element -- short-lived storage addresses from the server */}
    {small.src && <img className={css.photo} src={small.src} alt={big.src ? "" : alt} draggable={false} decoding="async" onError={small.onError} />}
    {/* eslint-disable-next-line @next/next/no-img-element -- as above */}
    {big.src && <img className={css.photo} src={big.src} alt={alt} draggable={false} decoding="async" fetchPriority="high"
      data-loaded={loaded === big.src || !small.src ? "true" : "false"} onLoad={() => setLoaded(big.src)} onError={big.onError} />}
  </>;
}

export function StackDeck({ items, index, onIndex, onLike, onReact, onOptions, reactionsOf, now, panel, label, describe, children }: {
  items: FeedPhoto[];
  index: number;
  onIndex: (next: number, how: "swipe" | "tap" | "key") => void;
  /** Double tap on the photo (never on one's own): the red heart. */
  onLike: (photo: FeedPhoto) => void;
  /** A tap on a reaction pill of another person's photo: react with that emoji, or take it back. */
  onReact?: (photo: FeedPhoto, emoji: string) => void;
  /** The "…" on the front card. */
  onOptions?: (photo: FeedPhoto) => void;
  /** The reactions to show on a photo (the screen keeps the ones just given); the photo's own when left out. */
  reactionsOf?: (photo: FeedPhoto) => ReactionCount[];
  now: Date;
  /** Shown in the front card's place instead (end, empty, hidden for me, loading). */
  panel?: ReactNode;
  /** The region's name ("Momen"). */
  label: string;
  /** "3 dari 24": spoken with each card. */
  describe: (index: number) => string;
  children?: ReactNode;
}) {
  const t = useT();
  const { lang } = useLang();
  const front = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; t: number; dx: number; captured: boolean; width: number; id: number } | null>(null);
  const frame = useRef(0);
  const swallowClick = useRef(false);
  const lastTap = useRef(0);
  const [burst, setBurst] = useState(0);
  const atEnd = index >= items.length;
  const current = items[index];

  // The next large photos, fetched ahead so the next card is sharp at once.
  useEffect(() => {
    for (const photo of items.slice(index + 1, index + 3)) {
      if (!photo.src.besar) continue;
      const image = new Image();
      image.src = photo.src.besar;
      image.decode?.().catch(() => undefined);
    }
  }, [items, index]);

  function go(step: 1 | -1, how: "swipe" | "tap" | "key") {
    const next = index + step;
    if (next < 0 || next > items.length) return;
    onIndex(next, how);
  }

  function setTransform(dx: number) {
    const element = front.current;
    if (!element) return;
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      element.style.transform = reducedMotion() ? `translateX(${dx}px)` : `translateX(${dx}px) rotate(${dx / 20}deg)`;
    });
  }
  function settle(element: HTMLDivElement) {
    cancelAnimationFrame(frame.current);
    element.removeAttribute("data-dragging");
    element.style.transform = "";
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || !front.current) return;
    drag.current = { x: event.clientX, y: event.clientY, t: event.timeStamp, dx: 0, captured: false, width: front.current.offsetWidth, id: event.pointerId };
  }
  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const state = drag.current;
    const element = front.current;
    if (!state || !element || event.pointerId !== state.id) return;
    const dx = event.clientX - state.x, dy = event.clientY - state.y;
    if (!state.captured) {
      if (Math.abs(dy) > TAP_SLOP && Math.abs(dy) > Math.abs(dx)) { drag.current = null; return; } // a scroll, not a swipe
      if (Math.abs(dx) <= TAP_SLOP) return;
      state.captured = true;
      element.setPointerCapture?.(event.pointerId);
      element.setAttribute("data-dragging", "");
    }
    state.dx = dx;
    setTransform(dx);
  }
  function onPointerEnd(event: ReactPointerEvent<HTMLDivElement>) {
    const state = drag.current;
    const element = front.current;
    drag.current = null;
    if (!state || !element || !state.captured) return;
    swallowClick.current = true;
    window.setTimeout(() => { swallowClick.current = false; }, 0);
    if (event.type === "pointercancel") { settle(element); return; }
    const speed = state.dx / Math.max(1, event.timeStamp - state.t);
    const decision = swipeDecision(state.dx, state.width, speed);
    const can = decision === "next" ? index < items.length : decision === "prev" ? index > 0 : false;
    if (!can) { settle(element); return; }
    element.removeAttribute("data-dragging");
    if (reducedMotion()) { element.style.transform = ""; go(decision === "next" ? 1 : -1, "swipe"); return; }
    const out = decision === "next" ? -1.3 : 1.3;
    element.style.transform = `translateX(${out * state.width}px) rotate(${out * 12}deg)`;
    window.setTimeout(() => go(decision === "next" ? 1 : -1, "swipe"), 180);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowRight") { event.preventDefault(); go(1, "key"); }
    if (event.key === "ArrowLeft") { event.preventDefault(); go(-1, "key"); }
  }

  /** A tap in the middle of the photo; two quick ones = the red heart (not on one's own photo). */
  function onMiddleTap(event: ReactMouseEvent<HTMLDivElement>) {
    if (swallowClick.current || event.target !== event.currentTarget || !current || current.mine) return;
    const at = event.timeStamp;
    if (at - lastTap.current < 320) {
      lastTap.current = 0;
      onLike(current);
      setBurst(value => value + 1);
    } else lastTap.current = at;
  }

  const places = ["front", "next", "later"] as const;
  const shown = items.slice(index, index + 3);
  const swipe = { onPointerDown, onPointerMove, onPointerUp: onPointerEnd, onPointerCancel: onPointerEnd };
  const swallow = (event: ReactMouseEvent) => { if (swallowClick.current) { event.preventDefault(); event.stopPropagation(); } };
  const taps = <>
    <button type="button" className={`${css.tap} ${css.tapPrev}`} aria-label={t("momen.stack.prev")} disabled={index === 0} onClick={() => go(-1, "tap")} />
    {index < items.length && <button type="button" className={`${css.tap} ${css.tapNext}`} aria-label={t("momen.stack.next")} onClick={() => go(1, "tap")} />}
  </>;
  const showPanel = !!panel || atEnd;
  return <div className={css.deck} data-panel={showPanel || undefined} role="region" aria-roledescription="carousel" aria-label={label} tabIndex={0} onKeyDown={onKeyDown}>
    <div className={css.deckInner}><div className={css.pile}>
      {shown.map((photo, offset) => {
        const place = places[offset];
        const isFront = offset === 0;
        if (isFront && showPanel) return null;
        const alt = photoAlt(photo, now, lang);
        return <div key={photo.id} ref={isFront ? front : undefined} className={css.card} data-place={place}
          role={isFront ? "group" : undefined} aria-roledescription={isFront ? "slide" : undefined} aria-label={isFront ? `${describe(index)}. ${alt}` : undefined}
          aria-hidden={isFront ? undefined : true}
          {...(isFront ? { ...swipe, onClick: onMiddleTap, onClickCapture: swallow } : {})}>
          <CardPhoto photo={photo} large={isFront} alt={alt} />
          {isFront && <>
            {taps}
            {burst > 0 && <span key={burst} aria-hidden className={css.burst}>{HEART}</span>}
          </>}
          {isFront && photo.mine && <span className={css.mineTag} aria-hidden><Pill tone="onmedia">{t("momen.yourPhoto")}</Pill></span>}
          {isFront && onOptions && <IconButton className={css.options} variant="onmedia" icon={Ellipsis} label={t("momen.photoOptions")} onClick={() => onOptions(photo)} />}
          {isFront && <ReactionPills reactions={reactionsOf ? reactionsOf(photo) : photo.reactions} mine={photo.mine} onReact={onReact ? emoji => onReact(photo, emoji) : undefined} />}
          <div className={css.info} aria-hidden>
            <Avatar name={photo.owner.name} photo={photo.owner.photo} size={32} />
            <span className={css.who}>
              <span className={css.name}>{photo.owner.name}</span>
              <span className={css.meta}>{photoMeta(photo, now, lang)}</span>
            </span>
            {photo.audience === "kelompok" && <Lock className={css.lock} aria-hidden />}
          </div>
        </div>;
      })}
      {showPanel && <div ref={front} className={`${css.card} ${css.panel}`} data-place="front" role="group" aria-roledescription="slide" aria-label={describe(index)} {...swipe} onClickCapture={swallow}>
        {taps}
        <div className={css.panelInner} role="status">{panel}</div>
      </div>}
    </div></div>
    {children}
  </div>;
}
