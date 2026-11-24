"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactElement, type ReactNode } from "react";
import { CalendarDays, ChevronRight, CircleCheck, Clock, MapPin, TrainFront, Utensils } from "lucide-react";
import type { HomeData, SlideSession } from "@/lib/main-wam/peserta/home";
import type { SessionKind } from "@/lib/main-wam/types";
import { mainWamPath } from "@/lib/routes";
import { useT } from "@/components/main-wam/i18n";
import { ShellIndicator } from "@/components/main-wam/shell";
import { BracketCard, EyebrowLabel, Pill } from "@/components/main-wam/ui";
import { NowCard } from "./NowCard";
import css from "./beranda.module.css";

const KIND_ICON = { sesi: <CalendarDays />, makan: <Utensils />, perjalanan: <TrainFront /> } satisfies Record<SessionKind, ReactElement>;

type Slot = "done" | "now" | "upcoming";
type Slide = { slot: Slot; key: string; title: string; node: ReactNode };

/** The status words of a card, for the indicator's names and the cards' own labels (the Sekarang card says Berikutnya or Sedang berlangsung). */
export function slideStatus(slot: Slot, nowStatus: "next" | "live" | "present" | "done" | null): "done" | "live" | "next" | "upcoming" {
  if (slot === "done") return "done";
  if (slot === "upcoming") return "upcoming";
  return nowStatus === "live" ? "live" : nowStatus === "done" ? "done" : "next";
}

/**
 * A side card of the slide (prototipe .mc, same bracket card as Sekarang): "SELESAI" for the session
 * that has just ended (no Absen; a small link to its detail), "AKAN DATANG" for the one after the
 * Sekarang card (when, where; no Absen either). Both end in a foot with a link to Detail sesi (the title is not a second link).
 */
function SideCard({ slot, session }: { slot: "done" | "upcoming"; session: SlideSession }) {
  const t = useT();
  const done = slot === "done";
  const place = [session.place, session.time].filter(Boolean).join(" · ");
  const body = <>
    <h2 className={css.title}>{session.title}</h2>
    <span className={css.meta}>
      <span className={css.metaItem}>{session.place ? <MapPin aria-hidden /> : <Clock aria-hidden />}<span>{place}</span></span>
    </span>
  </>;
  return <BracketCard as="article" motif="konstelasi" className={done ? `${css.now} ${css.sideDone}` : css.now}>
    <div className={css.top}>
      <span className={css.state}>
        {done ? <EyebrowLabel tone="gold" icon={<CircleCheck />}>{t("peserta.slides.done")}</EyebrowLabel> : <EyebrowLabel tone="gold">{t("peserta.slides.upcoming")}</EyebrowLabel>}
      </span>
      <Pill icon={KIND_ICON[session.sessionKind]}>{t(`peserta.session.kind.${session.sessionKind}`)}</Pill>
    </div>
    <div className={`${css.link} ${css.sideBody}`}>{body}</div>
    <div className={css.sideFoot}>
      {!done && <span className={css.nextTime}>{session.time.split("–")[0]}</span>}
      <Link href={mainWamPath.session(session.sessionId)} className={css.detailLink} aria-label={`${t("peserta.slides.detail")}: ${session.title}`}>
        {t("peserta.slides.detail")}<ChevronRight aria-hidden />
      </Link>
    </div>
  </BracketCard>;
}

// Where a card sits when it is centred in the track (the cards are 90 % wide with the neighbours peeking at both edges).
const leftOf = (el: HTMLElement, index: number) => {
  const panel = el.children[index] as HTMLElement | undefined;
  return panel ? Math.max(panel.offsetLeft - (el.clientWidth - panel.offsetWidth) / 2, 0) : 0;
};
const nearest = (el: HTMLElement) => {
  const middle = el.scrollLeft + el.clientWidth / 2;
  let best = 0;
  let gap = Infinity;
  Array.from(el.children).forEach((child, index) => {
    const panel = child as HTMLElement;
    const away = Math.abs(panel.offsetLeft + panel.offsetWidth / 2 - middle);
    if (away < gap) { gap = away; best = index; }
  });
  return best;
};

/**
 * Beranda's main card as a carousel of at most three cards: the session that has just ended ("Selesai"), the Sekarang
 * card, the one after it ("Akan datang"). The card in view is about 90 % wide with the edge of the one before and after
 * peeking in, swiped sideways with one snap per card (scroll-snap, no scrollbar). All the cards are one height, the
 * Sekarang card's (the track stretches them: the tallest side card only wins when it is taller, so no text is cut), and it
 * never changes while swiping. It opens on the Sekarang card, and goes back to it when the session changes. The
 * indicator, one segment per card, sits in the head before the bell (ShellIndicator); a tap moves
 * to that card. The side cards come from the sessions already loaded (homeSlides): no more reads.
 */
export function NowSlides({ data, absen, serverNow }: { data: HomeData; absen?: ReactNode; serverNow: string }) {
  const t = useT();
  const track = useRef<HTMLDivElement>(null);
  const first = useRef(true);
  const [active, setActive] = useState(0);
  const slides: Slide[] = [];
  const { done, upcoming } = data.slides ?? { done: null, upcoming: null };
  if (done) slides.push({ slot: "done", key: `d:${done.sessionId}`, title: done.title, node: <SideCard slot="done" session={done} /> });
  const view = data.now;
  slides.push({ slot: "now", key: "now", title: view.kind === "sesi" ? view.title : "", node: <NowCard view={view} absen={absen} serverNow={serverNow} ceklis={data.ceklis} /> });
  if (upcoming) slides.push({ slot: "upcoming", key: `u:${upcoming.sessionId}`, title: upcoming.title, node: <SideCard slot="upcoming" session={upcoming} /> });
  const nowIndex = done ? 1 : 0;
  const nowStatus = view.kind === "sesi" ? view.status : null;
  // Which card the Sekarang session is: the slide goes back to it when this changes (a session starts or ends, a card appears).
  const anchor = `${view.kind === "sesi" ? view.sessionId : view.kind}|${done ? 1 : 0}`;

  const go = useCallback((index: number, smooth: boolean) => {
    const el = track.current;
    if (!el) return;
    const left = leftOf(el, index);
    const calm = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (typeof el.scrollTo === "function") el.scrollTo({ left, behavior: smooth && !calm ? "smooth" : "auto" });
    else el.scrollLeft = left;
  }, []);

  useLayoutEffect(() => {
    const el = track.current;
    if (!el) return;
    go(nowIndex, !first.current);
    first.current = false;
    setActive(nowIndex);
    el.dataset.ready = "";
  }, [anchor, go, nowIndex]);

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const onResize = () => go(active, false);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [active, go]);

  const onScroll = () => {
    const el = track.current;
    if (!el || !el.clientWidth) return;
    setActive(nearest(el));
  };

  const word = (slide: Slide) => t(`peserta.slides.${slideStatus(slide.slot, slide.slot === "now" ? nowStatus : null)}`);
  const single = slides.length < 2;
  return <div className={css.slides}>
    <div ref={track} className={css.track} data-single={single ? "" : undefined} role="region" aria-roledescription="carousel" aria-label={t("peserta.slides.label")} tabIndex={single ? undefined : 0} onScroll={onScroll}>
      {slides.map((slide, index) => <div key={slide.key} className={css.panel} role="group" aria-roledescription="slide" aria-label={t("peserta.slides.card", { n: index + 1, total: slides.length })} data-slot={slide.slot}>{slide.node}</div>)}
    </div>
    {!single && <ShellIndicator>
      <div className={css.indicator} role="group" aria-label={t("peserta.slides.indicator")}>
        {slides.map((slide, index) => <button key={slide.key} type="button" className={css.seg} data-slot={slide.slot} data-status={slideStatus(slide.slot, slide.slot === "now" ? nowStatus : null)}
          data-active={index === active ? "" : undefined} aria-current={index === active ? "true" : undefined}
          aria-label={slide.title ? `${word(slide)}: ${slide.title}` : word(slide)} onClick={() => go(index, true)}><i aria-hidden /></button>)}
      </div>
    </ShellIndicator>}
  </div>;
}
