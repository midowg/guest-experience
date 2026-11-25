"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactElement, type ReactNode } from "react";
import { CalendarClock, CalendarDays, CalendarHeart, ChevronRight, CircleCheck, Clock, History, MapPin, TrainFront, Utensils } from "lucide-react";
import { EMPTY_SLIDES, type HomeData, type SlideEmpty, type SlideName, type SlideSession } from "@/lib/main-wam/peserta/home";
import type { SessionKind } from "@/lib/main-wam/types";
import { mainWamPath } from "@/lib/routes";
import { useT } from "@/components/main-wam/i18n";
import { ShellIndicator } from "@/components/main-wam/shell";
import { BracketCard, Card, EyebrowLabel, IconBox, Pill } from "@/components/main-wam/ui";
import { NowCard } from "./NowCard";
import css from "./beranda.module.css";

const KIND_ICON = { sesi: <CalendarDays />, makan: <Utensils />, perjalanan: <TrainFront /> } satisfies Record<SessionKind, ReactElement>;

type Slot = SlideName;
/** `empty`: the placeholder's reason (its card and its segment are the calm ones); `label`: the card's name for the indicator and the screen reader. */
type Slide = { slot: Slot; key: string; title: string; label: string; empty: SlideEmpty | null; node: ReactNode };

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

const EMPTY_ICON = { noDone: <History />, noUpcoming: <CalendarClock />, tomorrow: <CalendarHeart /> } satisfies Record<SlideEmpty, ReactElement>;

/**
 * The place of a side card that has no session (owner, 25 Nov): the same card as the real ones but calm (tonal, dashed line,
 * no gold, no button): the eyebrow of its place ("Selesai" / "Akan datang"), an icon and one short line. It keeps the Sekarang card
 * in the middle of the slide; it is one height with the others like any card.
 */
function VacantCard({ slot, reason }: { slot: "done" | "upcoming"; reason: SlideEmpty }) {
  const t = useT();
  return <Card as="article" bracket className={css.vacant}>
    <div className={css.top}>
      <span className={css.state}><EyebrowLabel>{t(`peserta.slides.${slot}`)}</EyebrowLabel></span>
    </div>
    <div className={css.vacantBody}>
      <IconBox icon={EMPTY_ICON[reason]} size={48} round />
      <p className={css.vacantText}>{t(`peserta.slides.${reason}`)}</p>
    </div>
  </Card>;
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
 * Beranda's main card as a carousel of exactly three cards (owner, 25 Nov): the session that has just ended ("Selesai"), the
 * Sekarang card, the one after it ("Akan datang"). A side with no session is not left out: a calm placeholder card takes its
 * place (VacantCard: "Belum ada sesi yang selesai", "Tidak ada sesi berikutnya hari ini", "Sampai jumpa besok"), so the Sekarang
 * card is always the middle one and always opens centred. The card in view is about 86 % wide with the edge of the one before and
 * after peeking in evenly, swiped sideways with one snap per card (scroll-snap, no scrollbar). All the cards are one height, the
 * Sekarang card's (the track stretches them: the tallest side card only wins when it is taller, so no text is cut), and it never
 * changes while swiping. It opens on the Sekarang card, and goes back to it when the session changes. The indicator, always three
 * segments (the placeholder's one is dim), sits in the head before the bell (ShellIndicator); a tap, or Left/Right Arrow on it,
 * moves to that card. The side cards come from the sessions already loaded (homeSlides): no more reads.
 */
export function NowSlides({ data, absen, serverNow }: { data: HomeData; absen?: ReactNode; serverNow: string }) {
  const t = useT();
  const track = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const first = useRef(true);
  const [active, setActive] = useState(1);
  const [before, , after] = (data.slides ?? EMPTY_SLIDES).slots;
  const view = data.now;
  const nowTitle = view.kind === "sesi" ? view.title : view.kind === "selesai" ? t("peserta.now.doneTitle") : t("peserta.now.emptyTitle");
  const side = (slot: SlideName, place: typeof before, key: string): Slide => place.session
    ? { slot, key: `${key}:${place.session.sessionId}`, title: place.session.title, label: place.session.title, empty: null, node: <SideCard slot={slot as "done" | "upcoming"} session={place.session} /> }
    : { slot, key: `${key}:empty`, title: "", label: t(`peserta.slides.${place.empty ?? "noUpcoming"}`), empty: place.empty ?? "noUpcoming", node: <VacantCard slot={slot as "done" | "upcoming"} reason={place.empty ?? "noUpcoming"} /> };
  const slides: Slide[] = [
    side("done", before, "d"),
    { slot: "now", key: "now", title: nowTitle, label: nowTitle, empty: null, node: <NowCard view={view} absen={absen} serverNow={serverNow} ceklis={data.ceklis} /> },
    side("upcoming", after, "u"),
  ];
  const nowIndex = 1;
  const nowStatus = view.kind === "sesi" ? view.status : null;
  // Which session the Sekarang card is: the slide goes back to the middle when this changes (a session starts or ends).
  const anchor = view.kind === "sesi" ? view.sessionId : view.kind;

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
  }, [anchor, go]);

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

  /** Left/Right Arrow (and Home/End) on the indicator move to the neighbouring card and its segment. */
  const onKeys = (event: KeyboardEvent<HTMLDivElement>) => {
    const to = event.key === "ArrowLeft" ? active - 1 : event.key === "ArrowRight" ? active + 1 : event.key === "Home" ? 0 : event.key === "End" ? slides.length - 1 : null;
    if (to === null || to < 0 || to > slides.length - 1) return;
    event.preventDefault();
    go(to, true);
    setActive(to);
    (bar.current?.querySelectorAll("button")[to] as HTMLElement | undefined)?.focus();
  };

  const word = (slide: Slide) => slide.slot === "now" && !nowStatus ? slide.label : t(`peserta.slides.${slideStatus(slide.slot, slide.slot === "now" ? nowStatus : null)}`);
  const name = (slide: Slide) => slide.empty ? `${word(slide)}: ${t("peserta.slides.empty")}` : slide.slot === "now" && !nowStatus ? slide.label : slide.title ? `${word(slide)}: ${slide.title}` : word(slide);
  return <div className={css.slides}>
    <div ref={track} className={css.track} role="region" aria-roledescription="carousel" aria-label={t("peserta.slides.label")} tabIndex={0} onScroll={onScroll}>
      {slides.map((slide, index) => <div key={slide.key} className={css.panel} role="group" aria-roledescription="slide" data-slot={slide.slot} data-empty={slide.empty ? "" : undefined}
        aria-label={t(slide.empty ? "peserta.slides.cardEmpty" : "peserta.slides.card", { n: index + 1, total: slides.length })}>{slide.node}</div>)}
    </div>
    <ShellIndicator>
      <div ref={bar} className={css.indicator} role="group" aria-label={t("peserta.slides.indicator")} onKeyDown={onKeys}>
        {slides.map((slide, index) => <button key={slide.key} type="button" className={css.seg} data-slot={slide.slot} data-status={slideStatus(slide.slot, slide.slot === "now" ? nowStatus : null)}
          data-empty={slide.empty ? "" : undefined} data-active={index === active ? "" : undefined} aria-current={index === active ? "true" : undefined}
          aria-label={name(slide)} onClick={() => go(index, true)}><i aria-hidden /></button>)}
      </div>
    </ShellIndicator>
  </div>;
}
