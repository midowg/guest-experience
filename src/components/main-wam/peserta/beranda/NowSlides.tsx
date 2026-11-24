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
    <div className={css.link}>{body}</div>
    <div className={css.sideFoot}>
      {!done && <span className={css.nextTime}>{session.time.split("–")[0]}</span>}
      <Link href={mainWamPath.session(session.sessionId)} className={css.detailLink} aria-label={`${t("peserta.slides.detail")}: ${session.title}`}>
        {t("peserta.slides.detail")}<ChevronRight aria-hidden />
      </Link>
    </div>
  </BracketCard>;
}

/**
 * Beranda's main card as a slide of at most three cards, one per screen, swiped sideways (scroll-snap, no
 * scrollbar): the session that has just ended ("Selesai"), the Sekarang card, the one after it
 * ("Akan datang"). It opens on the Sekarang card, and goes back to it when the session changes. The
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
    const left = index * el.clientWidth;
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
    setActive(Math.min(Math.max(Math.round(el.scrollLeft / el.clientWidth), 0), slides.length - 1));
  };

  const word = (slide: Slide) => t(`peserta.slides.${slideStatus(slide.slot, slide.slot === "now" ? nowStatus : null)}`);
  const single = slides.length < 2;
  return <div className={css.slides}>
    <div ref={track} className={css.track} role="region" aria-roledescription="carousel" aria-label={t("peserta.slides.label")} tabIndex={single ? undefined : 0} onScroll={onScroll}>
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
