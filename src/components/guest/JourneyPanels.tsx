"use client";

import { isProgramLike } from "@/lib/program";
import type { MouseEvent } from "react";
import { ArrowDown, ArrowUpRight, Backpack, BedDouble, CalendarCheck, CalendarDays, Camera, Check, Clock3, Coffee, Gift, Footprints, Hand, Handshake, Heart, HeartHandshake, IdCard, Images, Info, Map as MapIcon, MapPin, Maximize2, MessageCircle, Music, Package, Phone, Pill, Presentation, Salad, Shirt, Sparkles, Star, Sun, TrainFront, Umbrella, Users, Utensils, type LucideIcon } from "lucide-react";
import { ButtonLink } from "@/components/ui";
import { parseContactPhone } from "@/lib/contact-phone";
import { localDay } from "@/lib/event-phase";
import type { EventRecord, MomentIcon, PlainImage, PrepareIcon, PrepareItem } from "@/lib/types";
import { imageSrcSet } from "./Gallery";
import { useWording } from "./language";
import { EmergencyCard } from "./ProgramAgenda";
import { PhotoZoom } from "./PhotoZoom";
import type { WordKey } from "@/lib/wording";
import styles from "./guest.module.css";
import { galleryPath } from "@/lib/routes";
import { initials } from "@/lib/staff";

export const momentIconComponents: Record<MomentIcon, LucideIcon> = {
  coffee: Coffee, utensils: Utensils, gift: Gift, users: Users, camera: Camera,
  music: Music, map: MapIcon, sparkles: Sparkles, presentation: Presentation, heart: Heart,
};

export const prepareIconComponents: Record<PrepareIcon, LucideIcon> = {
  shirt: Shirt, backpack: Backpack, gift: Gift, "id-card": IdCard, umbrella: Umbrella, sun: Sun,
  footprints: Footprints, utensils: Utensils, camera: Camera, pill: Pill, package: Package, info: Info,
};

/** Free-form preparation cards: dress code, what to bring, what is provided, or anything else. */
export function PrepareCards({ items }: { items: PrepareItem[] }) {
  return <ul className={styles.prepareCards}>
    {items.map((item, index) => {
      const Icon = prepareIconComponents[item.icon] ?? Info;
      return <li key={`${index}-${item.title}`} className={styles.prepareCard}>
        <div className={styles.cardHead}><h3>{item.title}</h3><span className={styles.momentIcon} aria-hidden="true"><Icon size={20} /></span></div>
        <div>
          {item.description && <p className={styles.multiline}>{item.description}</p>}
          {item.list.length > 0 && <ul className={styles.prepareList}>{item.list.map((line, i) => <li key={`${i}-${line}`}><Check size={15} aria-hidden="true" /> {line}</li>)}</ul>}
          {!!item.images?.length && <div className={styles.prepareImages}>{item.images.map((image, i) => <PhotoZoom key={`${i}-${image.url}`} image={image} sizes="(max-width: 960px) 33vw, 160px" />)}</div>}
        </div>
      </li>;
    })}
  </ul>;
}

function focusAnchor(e: MouseEvent<HTMLAnchorElement>) {
  const id = e.currentTarget.hash.slice(1);
  requestAnimationFrame(() => document.getElementById(id)?.focus({ preventScroll: true }));
}

function Photo({ image, sizes, className, priority = false }: { image: PlainImage; sizes: string; className?: string; priority?: boolean }) {
  if (!image.url) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img className={className} src={image.url} {...imageSrcSet(image.srcset, sizes)} alt={image.alt} loading={priority ? undefined : "lazy"} fetchPriority={priority ? "high" : undefined} referrerPolicy="no-referrer" />;
}

/** The PIC as a one-tap link: WhatsApp opens a chat, a phone channel dials the local number. */
export function contactLink(contact: EventRecord["contact"]) {
  const phone = contact?.name ? parseContactPhone(contact.phone) : null;
  if (!phone) return null;
  const whatsapp = contact.channel === "whatsapp";
  return { whatsapp, href: whatsapp ? `https://wa.me/${phone.international}` : `tel:${phone.local}`, local: phone.local };
}

/** The PIC's photo when one is set, otherwise their initials. Decorative: the name is next to it. */
export function PicAvatar({ contact, large = false }: { contact: EventRecord["contact"]; large?: boolean }) {
  const photo = contact.photo?.url ? contact.photo : null;
  const className = `${styles.picAvatar} ${large ? styles.picAvatarLarge : ""}`.trimEnd();
  // eslint-disable-next-line @next/next/no-img-element -- stored photo with its own sizes
  return photo ? <img className={className} src={photo.srcset?.[0]?.url || photo.url} alt="" />
    : <span className={className} aria-hidden="true">{initials(contact.name)}</span>;
}

function PicCard({ event, title }: { event: EventRecord; title: string }) {
  const { t } = useWording();
  const link = contactLink(event.contact);
  if (!link) return null;
  return <div className={styles.picCard}>
    <PicAvatar contact={event.contact} />
    <div className={styles.picText}>
      <p className={styles.picTitle}>{title}</p>
      {event.contact.role && <p className={styles.picRole}>{event.contact.role}</p>}
    </div>
    <a className={styles.picAction} href={link.href} target={link.whatsapp ? "_blank" : undefined} rel={link.whatsapp ? "noopener noreferrer" : undefined} aria-label={link.whatsapp ? `${t("contact.whatsapp.aria", { name: event.contact.name })}${t("common.newTab")}` : t("contact.call.aria", { name: event.contact.name })}>
      {link.whatsapp ? <MessageCircle size={20} aria-hidden="true" /> : <Phone size={20} aria-hidden="true" />}
    </a>
  </div>;
}

/** Hospitality's story: read, not filled in. The needs card points to the confirmation form. */
export function ExperienceContent({ event, rsvpVisible }: { event: EventRecord; rsvpVisible: boolean }) {
  const { t } = useWording();
  const { experience } = event;
  return <div className={styles.experienceBody}>
    <Photo image={experience.image} sizes="(max-width: 960px) 100vw, 852px" className={styles.experiencePhoto} />
    {experience.story && <p className={`${styles.experienceStory} ${styles.multiline}`}>{experience.story}</p>}
    {experience.moments.length > 0 && <ul className={styles.moments}>
      {experience.moments.map((moment, index) => {
        const Icon = momentIconComponents[moment.icon] ?? Sparkles;
        return <li key={`${index}-${moment.title}`}>
          <span className={styles.momentIcon} aria-hidden="true"><Icon size={20} /></span>
          <div><h3>{moment.title}</h3>{moment.description && <p>{moment.description}</p>}</div>
        </li>;
      })}
    </ul>}
    {rsvpVisible && <a className={styles.needsCard} href="#rsvp" onClick={focusAnchor}>
      <Salad size={22} aria-hidden="true" />
      <span><strong>{t("section.experience.needs")}</strong><span>{t("section.experience.needs.sub")}</span></span>
    </a>}
  </div>;
}

/** Route steps sit under the address or map; each step may carry the photo of its turn. */
export function RouteGuideContent({ event }: { event: EventRecord }) {
  const { t } = useWording();
  const { route } = event;
  // Without a guide there is nothing for the PIC card to accompany; the Kontak section covers it.
  if (!route.map_image.url && !route.steps.length) return null;
  return <div className={styles.routeGuide}>
    {route.map_image.url && <figure className={styles.routeMap}>
      <Photo image={route.map_image} sizes="(max-width: 960px) 100vw, 852px" />
      <a className={styles.routeMapZoom} href={route.map_image.url} target="_blank" rel="noopener noreferrer"><Maximize2 size={14} aria-hidden="true" /> {t("location.zoom")}<span className="sr-only">{t("common.newTab")}</span></a>
    </figure>}
    {route.steps.length > 0 && <ol className={styles.routeSteps}>
      {route.steps.map((step, index) => <li key={`${index}-${step.title}`}>
        <span className={styles.routeNumber} aria-hidden="true">{index + 1}</span>
        <div>
          <h3>{step.title}</h3>
          {step.description && <p className={styles.multiline}>{step.description}</p>}
          <Photo image={step.image} sizes="(max-width: 960px) 90vw, 760px" className={styles.routePhoto} />
        </div>
      </li>)}
    </ol>}
    <PicCard event={event} title={t("location.lost", { name: event.contact.name })} />
  </div>;
}

export const teamPoints: { icon: LucideIcon; key: WordKey }[] = [
  { icon: Users, key: "team.p1" }, { icon: HeartHandshake, key: "team.p2" }, { icon: Hand, key: "team.p3" }, { icon: Heart, key: "team.p4" },
];

type AgendaStatus = "done" | "now" | "next";
function agendaStatus(item: EventRecord["agenda"][number], now: number | null): AgendaStatus {
  if (now === null) return "next";
  if (Date.parse(item.ends_at) <= now) return "done";
  if (Date.parse(item.starts_at) <= now) return "now";
  return "next";
}

/**
 * The day itself: who is welcomed, what is happening now, and who to call. The full invitation
 * stays below, so nothing the guest read before the day has gone missing.
 */
export function TodayPanel({ event, invitee, now, firstSection }: { event: EventRecord; invitee?: string; now: number | null; firstSection?: string }) {
  const { t, time } = useWording();
  const sorted = [...event.agenda].sort((a, b) => a.sort_order - b.sort_order);
  // A programme spans several days; the guest needs today's part of it, not the whole week.
  const today = now === null ? null : localDay(now, event.timezone);
  const todays = today ? sorted.filter(item => localDay(item.starts_at, event.timezone) === today) : [];
  const items = todays.length ? todays : sorted;
  return <section className={styles.today} aria-labelledby="event-title" data-today-panel>
    <div className={`container ${styles.todayInner}`}>
      <p className={styles.todayBadge}><CalendarCheck size={14} aria-hidden="true" /> {t("today.badge")}</p>
      <h1 id="event-title" className={styles.todayTitle}>{invitee ? t("today.welcome", { name: invitee }) : event.title}</h1>
      <p className={styles.todayMeta}>{invitee && <>{event.title} · </>}{event.venue_name || t("today.place.fallback")}</p>
      {items.length > 0 && <div className={styles.todayCard}>
        <h2 className={styles.todayCardTitle}>{t("today.schedule")}</h2>
        {(() => {
          // "Next · in N min" for the coming hour, so the guest knows how long they have.
          const next = now === null ? undefined : items.find(item => Date.parse(item.starts_at) > now);
          const minutes = next && now !== null ? Math.ceil((Date.parse(next.starts_at) - now) / 60000) : 0;
          return next && minutes <= 60 ? <p className={styles.todayNext}><Clock3 size={15} aria-hidden="true" /> {t("next.label", { minutes })}: {next.title}</p> : null;
        })()}
        <ol className={styles.todaySchedule}>
          {items.map(item => {
            const status = agendaStatus(item, now);
            return <li key={item.id} className={status === "done" ? styles.todayDone : status === "now" ? styles.todayNow : undefined} aria-current={status === "now" ? "step" : undefined}>
              <time dateTime={item.starts_at} className={styles.todayTime}>{time(item.starts_at, event.timezone)}</time>
              <div><h3>{item.title}</h3>{item.description && <p>{item.description}</p>}</div>
              {status === "now" && <span className={styles.todayNowBadge}>{t("today.now")}</span>}
              {status === "done" && <><Check size={16} aria-hidden="true" /><span className="sr-only">{t("today.done")}</span></>}
            </li>;
          })}
        </ol>
      </div>}
      {event.day_note && <div className={styles.todayNote}><Info size={18} aria-hidden="true" /><p className={styles.multiline}>{event.day_note}</p></div>}
      <PicCard event={event} title={t("today.help", { name: event.contact.name })} />
      <EmergencyCard event={event} />
      {!event.emergency?.hospital && isProgramLike(event.event_kind) && event.trip?.contacts.hospital && <EmergencyCard event={{ ...event, emergency: { name: "", phone: "", hospital: event.trip.contacts.hospital, hospital_address: event.trip.contacts.hospital_address, hospital_maps_url: event.trip.contacts.hospital_maps_url } }} />}
      {firstSection && <a className={styles.todayMore} href={`#${firstSection}`} onClick={focusAnchor}>{t("today.more")} <ArrowDown size={15} aria-hidden="true" /></a>}
    </div>
  </section>;
}

/**
 * After the event: thanks first. Review and collaboration are only for external guests, and the
 * review is never a condition for anything else on the page.
 */
export function AfterPanel({ event, invitee, photoCount = 0 }: { event: EventRecord; invitee?: string; photoCount?: number }) {
  const { t, date } = useWording();
  const external = event.audience !== "internal";
  const image = event.after.image.url ? event.after.image : event.hero.url ? { url: event.hero.url, alt: "", srcset: event.hero.srcset } : null;
  const message = event.after.message || event.closing;
  const collaboration = event.after.collaboration;
  const pic = contactLink(event.contact);
  const showReview = external && event.review_enabled && !!event.review_url;
  const showCollaboration = external && collaboration.enabled && !!pic;
  return <section className={styles.after} aria-labelledby="event-title" data-after-panel>
    {image && <div className={styles.afterPhoto}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={image.url} {...imageSrcSet(image.srcset, "100vw")} alt={image.alt} fetchPriority="high" referrerPolicy="no-referrer" />
    </div>}
    <div className={`container ${styles.afterInner}`}>
      <p className="eyebrow">{t("after.eyebrow")}</p>
      <h1 id="event-title">{event.after.title || (invitee ? t("after.title.named", { name: invitee }) : t("after.title"))}</h1>
      <p className={styles.afterEvent}><CalendarDays size={16} aria-hidden="true" /> {event.title}{event.starts_at && <> · {date(event.starts_at, event.timezone)}</>}</p>
      {message && <p className={`${styles.afterMessage} ${styles.multiline}`}>{message}</p>}
      {photoCount > 0 && <ButtonLink href={galleryPath(event)} className={styles.afterGallery}><Images size={18} aria-hidden="true" /> {t("gallery.all")} · {t("photos.count", { n: photoCount })}</ButtonLink>}
      {showReview && <div className={styles.afterCard}>
        <p className={styles.afterStars} aria-hidden="true">{[0, 1, 2, 3, 4].map(i => <Star key={i} size={20} />)}</p>
        <h2>{event.review_heading || t("after.review.title")}</h2>
        <p className={styles.multiline}>{event.review_description || t("after.review.sub")}</p>
        <ButtonLink variant="secondary" href={event.review_url} target="_blank" rel="noopener noreferrer">{event.review_button_label || t("after.review.button")} <ArrowUpRight size={17} aria-hidden="true" /><span className="sr-only">{t("common.newTab")}</span></ButtonLink>
      </div>}
      {showCollaboration && pic && <div className={`${styles.afterCard} ${styles.afterCollaboration}`}>
        <p className={styles.afterCardIcon} aria-hidden="true"><Handshake size={22} /></p>
        <h2>{collaboration.title || t("after.collab.title")}</h2>
        {collaboration.description && <p className={styles.multiline}>{collaboration.description}</p>}
        <ButtonLink href={pic.href} target={pic.whatsapp ? "_blank" : undefined} rel={pic.whatsapp ? "noopener noreferrer" : undefined}>
          {pic.whatsapp ? <MessageCircle size={18} aria-hidden="true" /> : <Phone size={18} aria-hidden="true" />} {collaboration.button_label || t("after.collab.button")}{pic.whatsapp && <span className="sr-only">{t("common.newTab")}</span>}
        </ButtonLink>
      </div>}
    </div>
  </section>;
}

/** Shortcut chips under the hero call to action, one per section the guest can actually reach. */
export function HeroShortcuts({ keys, inert }: { keys: string[]; inert: boolean }) {
  const { t } = useWording();
  const items = [
    { key: "experience", label: t("shortcut.experience"), icon: Sparkles },
    { key: "location", label: t("shortcut.location"), icon: MapPin },
    // A trip's guest mostly comes back for the train, the hotel and who to call.
    { key: "transport", label: t("shortcut.transport"), icon: TrainFront },
    { key: "stay", label: t("shortcut.stay"), icon: BedDouble },
    { key: "contact", label: t("shortcut.contact"), icon: Phone },
    { key: "contacts", label: t("shortcut.contacts"), icon: Phone },
  ].filter(item => keys.includes(item.key));
  if (items.length < 2) return null;
  return <nav className={styles.shortcuts} aria-label={t("shortcut.label")}>
    {items.map(({ key, label, icon: Icon }) => <a key={key} href={`#${key}`} onClick={e => { if (inert) { e.preventDefault(); return; } focusAnchor(e); }} tabIndex={inert ? -1 : undefined}><Icon size={18} aria-hidden="true" /> {label}</a>)}
  </nav>;
}
