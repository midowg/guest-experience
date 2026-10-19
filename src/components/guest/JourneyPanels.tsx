"use client";

import type { MouseEvent } from "react";
import { ArrowDown, ArrowUpRight, CalendarCheck, CalendarDays, Camera, Check, Coffee, Gift, Hand, Handshake, Heart, HeartHandshake, Info, Map as MapIcon, MapPin, Maximize2, MessageCircle, Music, Phone, Presentation, Salad, Sparkles, Star, Users, Utensils, type LucideIcon } from "lucide-react";
import { ButtonLink } from "@/components/ui";
import { formatDate, formatTime } from "@/lib/format";
import { parseContactPhone } from "@/lib/contact-phone";
import { localDay } from "@/lib/event-phase";
import type { EventRecord, MomentIcon, PlainImage } from "@/lib/types";
import { imageSrcSet } from "./Gallery";
import styles from "./guest.module.css";

export const momentIconComponents: Record<MomentIcon, LucideIcon> = {
  coffee: Coffee, utensils: Utensils, gift: Gift, users: Users, camera: Camera,
  music: Music, map: MapIcon, sparkles: Sparkles, presentation: Presentation, heart: Heart,
};

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

function PicCard({ event, title }: { event: EventRecord; title: string }) {
  const link = contactLink(event.contact);
  if (!link) return null;
  return <div className={styles.picCard}>
    <span className={styles.picAvatar} aria-hidden="true">{event.contact.name.trim().charAt(0).toUpperCase()}</span>
    <div className={styles.picText}>
      <p className={styles.picTitle}>{title} {event.contact.name}</p>
      {event.contact.role && <p className={styles.picRole}>{event.contact.role}</p>}
    </div>
    <a className={styles.picAction} href={link.href} target={link.whatsapp ? "_blank" : undefined} rel={link.whatsapp ? "noopener noreferrer" : undefined} aria-label={link.whatsapp ? `Hubungi ${event.contact.name} via WhatsApp (tab baru)` : `Telepon ${event.contact.name}`}>
      {link.whatsapp ? <MessageCircle size={20} aria-hidden="true" /> : <Phone size={20} aria-hidden="true" />}
    </a>
  </div>;
}

/** Hospitality's story: read, not filled in. The needs card points to the confirmation form. */
export function ExperienceContent({ event, rsvpVisible }: { event: EventRecord; rsvpVisible: boolean }) {
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
      <span><strong>Ada kebutuhan makanan atau akses?</strong><span>Sampaikan saat konfirmasi kehadiran.</span></span>
    </a>}
  </div>;
}

/** Route steps sit under the address or map; each step may carry the photo of its turn. */
export function RouteGuideContent({ event }: { event: EventRecord }) {
  const { route } = event;
  // Without a guide there is nothing for the PIC card to accompany; the Kontak section covers it.
  if (!route.map_image.url && !route.steps.length) return null;
  return <div className={styles.routeGuide}>
    {route.map_image.url && <figure className={styles.routeMap}>
      <Photo image={route.map_image} sizes="(max-width: 960px) 100vw, 852px" />
      <a className={styles.routeMapZoom} href={route.map_image.url} target="_blank" rel="noopener noreferrer"><Maximize2 size={14} aria-hidden="true" /> Perbesar peta<span className="sr-only"> (tab baru)</span></a>
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
    <PicCard event={event} title="Tersesat? Hubungi" />
  </div>;
}

export const teamPoints: { icon: LucideIcon; text: string }[] = [
  { icon: Users, text: "Di Werkudara, Anda akan bertemu dengan rekan-rekan dari berbagai latar belakang, termasuk rekan Tuli dan pengguna kursi roda." },
  { icon: HeartHandshake, text: "Kami terbiasa bekerja bersama dalam lingkungan yang inklusif dan saling menghargai." },
  { icon: Hand, text: "Silakan berinteraksi seperti biasa. Jika membutuhkan bantuan komunikasi, tim kami dengan senang hati akan membantu." },
  { icon: Heart, text: "Kami percaya setiap orang memiliki peran dan nilai yang berarti." },
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
  const sorted = [...event.agenda].sort((a, b) => a.sort_order - b.sort_order);
  // A programme spans several days; the guest needs today's part of it, not the whole week.
  const today = now === null ? null : localDay(now, event.timezone);
  const todays = today ? sorted.filter(item => localDay(item.starts_at, event.timezone) === today) : [];
  const items = todays.length ? todays : sorted;
  return <section className={styles.today} aria-labelledby="event-title" data-today-panel>
    <div className={`container ${styles.todayInner}`}>
      <p className={styles.todayBadge}><CalendarCheck size={14} aria-hidden="true" /> Hari ini</p>
      <h1 id="event-title" className={styles.todayTitle}>{invitee ? `Selamat datang, ${invitee}` : event.title}</h1>
      <p className={styles.todayMeta}>{invitee && <>{event.title} · </>}{event.venue_name || "Lokasi acara"}</p>
      {items.length > 0 && <div className={styles.todayCard}>
        <h2 className={styles.todayCardTitle}>Jadwal hari ini</h2>
        <ol className={styles.todaySchedule}>
          {items.map(item => {
            const status = agendaStatus(item, now);
            return <li key={item.id} className={status === "done" ? styles.todayDone : status === "now" ? styles.todayNow : undefined} aria-current={status === "now" ? "step" : undefined}>
              <time dateTime={item.starts_at} className={styles.todayTime}>{formatTime(item.starts_at, event.timezone)}</time>
              <div><h3>{item.title}</h3>{item.description && <p>{item.description}</p>}</div>
              {status === "now" && <span className={styles.todayNowBadge}>Sekarang</span>}
              {status === "done" && <><Check size={16} aria-hidden="true" /><span className="sr-only">Selesai</span></>}
            </li>;
          })}
        </ol>
      </div>}
      {event.day_note && <div className={styles.todayNote}><Info size={18} aria-hidden="true" /><p className={styles.multiline}>{event.day_note}</p></div>}
      <PicCard event={event} title="Butuh bantuan? Hubungi" />
      {firstSection && <a className={styles.todayMore} href={`#${firstSection}`} onClick={focusAnchor}>Lihat informasi lengkap <ArrowDown size={15} aria-hidden="true" /></a>}
    </div>
  </section>;
}

/**
 * After the event: thanks first. Review and collaboration are only for external guests, and the
 * review is never a condition for anything else on the page.
 */
export function AfterPanel({ event, invitee }: { event: EventRecord; invitee?: string }) {
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
      <p className="eyebrow">Terima kasih telah hadir</p>
      <h1 id="event-title">{event.after.title || (invitee ? `Terima kasih, ${invitee}.` : "Terima kasih atas kehadiran Anda.")}</h1>
      <p className={styles.afterEvent}><CalendarDays size={16} aria-hidden="true" /> {event.title}{event.starts_at && <> · {formatDate(event.starts_at, event.timezone)}</>}</p>
      {message && <p className={`${styles.afterMessage} ${styles.multiline}`}>{message}</p>}
      {showReview && <div className={styles.afterCard}>
        <p className={styles.afterStars} aria-hidden="true">{[0, 1, 2, 3, 4].map(i => <Star key={i} size={20} />)}</p>
        <h2>{event.review_heading || "Berkenan berbagi pengalaman?"}</h2>
        <p className={styles.multiline}>{event.review_description || "Ulasan Google sepenuhnya sukarela."}</p>
        <ButtonLink variant="secondary" href={event.review_url} target="_blank" rel="noopener noreferrer">{event.review_button_label || "Bagikan ulasan Anda"} <ArrowUpRight size={17} aria-hidden="true" /><span className="sr-only"> (tab baru)</span></ButtonLink>
      </div>}
      {showCollaboration && pic && <div className={`${styles.afterCard} ${styles.afterCollaboration}`}>
        <p className={styles.afterCardIcon} aria-hidden="true"><Handshake size={22} /></p>
        <h2>{collaboration.title || "Mari lanjutkan percakapannya"}</h2>
        {collaboration.description && <p className={styles.multiline}>{collaboration.description}</p>}
        <ButtonLink href={pic.href} target={pic.whatsapp ? "_blank" : undefined} rel={pic.whatsapp ? "noopener noreferrer" : undefined}>
          {pic.whatsapp ? <MessageCircle size={18} aria-hidden="true" /> : <Phone size={18} aria-hidden="true" />} {collaboration.button_label || "Hubungi tim Werkudara"}{pic.whatsapp && <span className="sr-only"> (tab baru)</span>}
        </ButtonLink>
      </div>}
    </div>
  </section>;
}

/** Shortcut chips under the hero call to action, one per section the guest can actually reach. */
export function HeroShortcuts({ keys, inert }: { keys: string[]; inert: boolean }) {
  const items = [
    { key: "experience", label: "Pengalaman", icon: Sparkles },
    { key: "location", label: "Panduan", icon: MapPin },
    { key: "contact", label: "Kontak", icon: Phone },
  ].filter(item => keys.includes(item.key));
  if (items.length < 2) return null;
  return <nav className={styles.shortcuts} aria-label="Pintasan undangan">
    {items.map(({ key, label, icon: Icon }) => <a key={key} href={`#${key}`} onClick={e => { if (inert) { e.preventDefault(); return; } focusAnchor(e); }} tabIndex={inert ? -1 : undefined}><Icon size={18} aria-hidden="true" /> {label}</a>)}
  </nav>;
}
