"use client";

import type { CSSProperties, MouseEvent } from "react";
import { ArrowDown, ArrowRight, CalendarDays, Check, Clock3, MapPin } from "lucide-react";
import { ButtonLink } from "@/components/ui";
import { useWording } from "./language";
import { tzLabel } from "@/lib/timezones";
import { getFraming } from "@/lib/hero-framing";
import type { EventContact, PrepareContent, SectionKey } from "@/lib/types";
import type { HeroPreviewEvent } from "@/lib/hero-preview";
import { imageSrcSet } from "./Gallery";
import { HeroShortcuts } from "./JourneyPanels";
import styles from "./guest.module.css";

export function visibleSections(event: HeroPreviewEvent & { contact?: EventContact; prepare?: PrepareContent }) {
  return event.sections.filter(section => section.enabled && (section.key !== "feedback" || (event.feedback_enabled && event.feedback_questions.length > 0)) && (section.key !== "contact" || (!!event.contact?.name && !!event.contact.phone)) && (section.key !== "prepare" || !!event.prepare?.items.length));
}
const kindEyebrow = { kunjungan: "hero.eyebrow.kunjungan", acara: "hero.eyebrow.acara", program: "hero.eyebrow.program", kartu: "hero.eyebrow.acara", eguide: "hero.eyebrow.acara", csr: "hero.eyebrow.acara" } as const;

export function TimeRange({ start, end, timezone }: { start: string; end: string | null; timezone: string }) {
  const { t, time } = useWording();
  if (!start) return <>{t("hero.date.empty")}</>;
  return <><time dateTime={start}>{time(start, timezone)}</time>{end && <> – <time dateTime={end}>{time(end, timezone)}</time></>} {tzLabel(timezone)}</>;
}
export function InvitationHero({ event, rsvpSaved = false, inert = false, invitee }: { event: HeroPreviewEvent; rsvpSaved?: boolean; inert?: boolean; invitee?: string }) {
  const { t, date } = useWording();
  const sections = visibleSections(event);
  const has = (key: SectionKey) => sections.some(section => section.key === key);
  const cta = has("rsvp") && event.rsvp_enabled && !rsvpSaved ? { href: "#rsvp", label: t("hero.cta.rsvp") } : has("location") ? { href: "#location", label: t("hero.cta.location") } : has("agenda") ? { href: "#agenda", label: t("hero.cta.agenda") } : null;
  function focusAnchor(e: MouseEvent<HTMLAnchorElement>) {
    if (inert) { e.preventDefault(); return; }
    const id = e.currentTarget.hash.slice(1);
    requestAnimationFrame(() => document.getElementById(id)?.focus({ preventScroll: true }));
  }
  const hero = event.hero;
  const framing = getFraming(hero);
  const photoStyle = Object.fromEntries(Object.entries(framing).flatMap(([device, frame]) => [
    [`--${device}-x`, `${frame.x}%`], [`--${device}-y`, `${frame.y}%`], [`--${device}-zoom`, frame.zoom],
  ])) as CSSProperties;
  const intro = <>
    <p className="eyebrow">{t(kindEyebrow[event.event_kind ?? "acara"])}</p>
    {event.greeting && <p className={styles.greeting}>{event.greeting}</p>}
    {invitee && <p className={styles.greeting}>{t("hero.to", { name: invitee })}</p>}
    <h1 id="event-title">{event.title}</h1>
    {event.subtitle && <p className={styles.subtitle}>{event.subtitle}</p>}
  </>;
  const actions = <>
    <div className={styles.actions}>{cta && <ButtonLink href={cta.href} onClick={focusAnchor} tabIndex={inert ? -1 : undefined}>{cta.label} <ArrowRight size={18} aria-hidden="true" /></ButtonLink>}{has("about") && <a href="#about" className={styles.textLink} onClick={focusAnchor} tabIndex={inert ? -1 : undefined}>{t("hero.link.about")} <ArrowDown size={16} aria-hidden="true" /></a>}</div>
    <HeroShortcuts keys={sections.map(section => section.key)} inert={inert} />
    {rsvpSaved && <p className={styles.savedHint}><Check size={17} aria-hidden="true" /> {t("hero.saved")}</p>}
  </>;
  const facts = (photographic: boolean) => <>
    <div className={photographic ? styles.heroMetaItem : styles.fact}><CalendarDays size={photographic ? 20 : 22} aria-hidden="true" /><div><span>{t("hero.date")}</span><p><time dateTime={event.starts_at}>{event.starts_at ? date(event.starts_at, event.timezone) : t("hero.date.empty")}</time></p></div></div>
    <div className={photographic ? styles.heroMetaItem : styles.fact}><Clock3 size={photographic ? 20 : 22} aria-hidden="true" /><div><span>{t("hero.time")}</span><p><TimeRange start={event.starts_at} end={event.ends_at} timezone={event.timezone} /></p></div></div>
    <div className={photographic ? styles.heroMetaItem : styles.fact}><MapPin size={photographic ? 20 : 22} aria-hidden="true" /><div><span>{t("hero.place")}</span><p>{event.venue_name || t("hero.place.empty")}</p>{!photographic && event.address && <p className={styles.factAddress}>{event.address}</p>}</div></div>
  </>;
  return hero.url ? <section className={styles.heroImage} aria-labelledby="event-title" data-invitation-hero>
    <div className={styles.heroBackdrop}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={hero.url} {...imageSrcSet(hero.srcset, "100vw")} style={photoStyle} alt="" aria-hidden="true" fetchPriority="high" referrerPolicy="no-referrer" data-hero-photo />
    </div>
    <div className={styles.heroScrim} aria-hidden="true" />
    <div className={`${styles.heroInner} ${hero.text_position === "center" ? styles.heroInnerCenter : ""}`.trimEnd()}>
      {intro}<div className={styles.heroMeta}>{facts(true)}</div>{actions}
      {sections.length > 0 && <a className={styles.scrollCue} href={`#${sections[0].key}`} onClick={focusAnchor} tabIndex={inert ? -1 : undefined}>{t("hero.scroll")} <ArrowDown size={15} aria-hidden="true" /></a>}
    </div>
  </section> : <section className={`container ${styles.hero}`} aria-labelledby="event-title" data-invitation-hero>
    <div className={styles.heroMain}>{intro}{actions}</div>
    <aside className={styles.facts} aria-label={t("hero.facts.aria")}><p className="eyebrow">{t("hero.facts")}</p>{facts(false)}</aside>
  </section>;
}
