"use client";

import type { CSSProperties, MouseEvent } from "react";
import { ArrowDown, ArrowRight, CalendarDays, Check, Clock3, MapPin } from "lucide-react";
import { ButtonLink } from "@/components/ui";
import { formatDate, formatTime } from "@/lib/format";
import { getFraming } from "@/lib/hero-framing";
import type { EventContact, SectionKey } from "@/lib/types";
import type { HeroPreviewEvent } from "@/lib/hero-preview";
import { imageSrcSet } from "./Gallery";
import styles from "./guest.module.css";

export function visibleSections(event: HeroPreviewEvent & { contact?: EventContact }) {
  return event.sections.filter(section => section.enabled && (section.key !== "feedback" || (event.feedback_enabled && event.feedback_questions.length > 0)) && (section.key !== "contact" || (!!event.contact?.name && !!event.contact.phone)));
}
export function TimeRange({ start, end, timezone }: { start: string; end: string | null; timezone: string }) {
  if (!start) return <>Waktu belum diisi</>;
  return <><time dateTime={start}>{formatTime(start, timezone)}</time>{end && <> – <time dateTime={end}>{formatTime(end, timezone)}</time></>} WIB</>;
}
export function InvitationHero({ event, rsvpSaved = false, inert = false, invitee }: { event: HeroPreviewEvent; rsvpSaved?: boolean; inert?: boolean; invitee?: string }) {
  const sections = visibleSections(event);
  const has = (key: SectionKey) => sections.some(section => section.key === key);
  const cta = has("rsvp") && event.rsvp_enabled && !rsvpSaved ? { href: "#rsvp", label: "Konfirmasi kehadiran" } : has("location") ? { href: "#location", label: "Menuju lokasi" } : has("agenda") ? { href: "#agenda", label: "Lihat jadwal acara" } : null;
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
    <p className="eyebrow">Undangan pertemuan</p>
    {event.greeting && <p className={styles.greeting}>{event.greeting}</p>}
    {invitee && <p className={styles.greeting}>Kepada {invitee}</p>}
    <h1 id="event-title">{event.title}</h1>
    {event.subtitle && <p className={styles.subtitle}>{event.subtitle}</p>}
  </>;
  const actions = <>
    <div className={styles.actions}>{cta && <ButtonLink href={cta.href} onClick={focusAnchor} tabIndex={inert ? -1 : undefined}>{cta.label} <ArrowRight size={18} aria-hidden="true" /></ButtonLink>}{has("about") && <a href="#about" className={styles.textLink} onClick={focusAnchor} tabIndex={inert ? -1 : undefined}>Tentang pertemuan <ArrowDown size={16} aria-hidden="true" /></a>}</div>
    {rsvpSaved && <p className={styles.savedHint}><Check size={17} aria-hidden="true" /> Konfirmasi Anda telah tersimpan.</p>}
  </>;
  const facts = (photographic: boolean) => <>
    <div className={photographic ? styles.heroMetaItem : styles.fact}><CalendarDays size={photographic ? 20 : 22} aria-hidden="true" /><div><span>Tanggal</span><p><time dateTime={event.starts_at}>{event.starts_at ? formatDate(event.starts_at, event.timezone) : "Tanggal belum diisi"}</time></p></div></div>
    <div className={photographic ? styles.heroMetaItem : styles.fact}><Clock3 size={photographic ? 20 : 22} aria-hidden="true" /><div><span>Waktu</span><p><TimeRange start={event.starts_at} end={event.ends_at} timezone={event.timezone} /></p></div></div>
    <div className={photographic ? styles.heroMetaItem : styles.fact}><MapPin size={photographic ? 20 : 22} aria-hidden="true" /><div><span>Tempat</span><p>{event.venue_name || "Lokasi belum ditentukan"}</p>{!photographic && event.address && <p className={styles.factAddress}>{event.address}</p>}</div></div>
  </>;
  return hero.url ? <section className={styles.heroImage} aria-labelledby="event-title" data-invitation-hero>
    <div className={styles.heroBackdrop}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={hero.url} {...imageSrcSet(hero.srcset, "100vw")} style={photoStyle} alt="" aria-hidden="true" fetchPriority="high" referrerPolicy="no-referrer" data-hero-photo />
    </div>
    <div className={styles.heroScrim} aria-hidden="true" />
    <div className={`${styles.heroInner} ${hero.text_position === "center" ? styles.heroInnerCenter : ""}`.trimEnd()}>
      {intro}<div className={styles.heroMeta}>{facts(true)}</div>{actions}
      {sections.length > 0 && <a className={styles.scrollCue} href={`#${sections[0].key}`} onClick={focusAnchor} tabIndex={inert ? -1 : undefined}>Gulir untuk membaca <ArrowDown size={15} aria-hidden="true" /></a>}
    </div>
  </section> : <section className={`container ${styles.hero}`} aria-labelledby="event-title" data-invitation-hero>
    <div className={styles.heroMain}>{intro}{actions}</div>
    <aside className={styles.facts} aria-label="Waktu dan tempat pertemuan"><p className="eyebrow">Catat pertemuannya</p>{facts(false)}</aside>
  </section>;
}
