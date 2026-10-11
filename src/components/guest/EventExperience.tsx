"use client";

import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { ArrowUp, ArrowUpRight, Copy, Images, MapPin } from "lucide-react";
import { Button, ButtonLink, Notice, SectionHeading } from "@/components/ui";
import { formatDate, formatTime } from "@/lib/format";
import { parseLocationEmbed } from "@/lib/location-embed";
import { parseContactPhone } from "@/lib/contact-phone";
import type { EventRecord, SectionKey } from "@/lib/types";
import { Gallery, venuePhotos } from "./Gallery";
import { InvitationHero, TimeRange, visibleSections } from "./InvitationHero";
import { FeedbackForm, RsvpForm } from "./GuestForms";
import { feedbackIsOpen, rsvpIsOpen } from "./form-utils";
import styles from "./guest.module.css";

const sectionLabels: Record<SectionKey, string> = { about: "Acara", agenda: "Jadwal", location: "Lokasi", rsvp: "Konfirmasi", contact: "Kontak", feedback: "Masukan" };

function focusAnchor(e: MouseEvent<HTMLAnchorElement>) {
  const id = e.currentTarget.hash.slice(1);
  requestAnimationFrame(() => document.getElementById(id)?.focus({ preventScroll: true }));
}

/**
 * A soft arrival for blocks that are still below the fold. The hidden state is set by script
 * after mount, never rendered on the server: if the script never runs, the markup carries no
 * reveal class and every section is simply visible.
 *
 * The off-screen test is what makes hiding after first paint safe. A block already in view
 * would flash — painted, hidden, faded back — and would also keep the guest waiting on an
 * animation to read what is in front of them, so such a block is left alone entirely.
 */
function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [state, setState] = useState<"idle" | "hidden" | "shown">("idle");
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (typeof IntersectionObserver !== "function") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    if (node.getBoundingClientRect().top < window.innerHeight * 0.92) return;
    setState("hidden");
    // A margin at the bottom lets the block start moving a moment after its top edge appears,
    // so the transition is finished by the time it is actually in reading position.
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      setState("shown");
      observer.disconnect();
    }, { rootMargin: "0px 0px -10% 0px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return [ref, state === "hidden" ? styles.revealPending : state === "shown" ? styles.revealShown : ""] as const;
}

/** The reveal rides on the section element itself, so no wrapper is added to the grid. */
function RevealSection({ id, className, labelledBy, children }: { id: string; className: string; labelledBy: string; children: ReactNode }) {
  const [ref, reveal] = useReveal<HTMLElement>();
  return <section ref={ref} id={id} tabIndex={-1} className={`${className} ${reveal}`.trimEnd()} aria-labelledby={labelledBy}>{children}</section>;
}

/**
 * Appears only once the guest is well past the opening, so it never sits over the first screen.
 * On a phone it is parked above the safe-area inset and clear of the form column; see
 * `.toTop` in guest.module.css for the 44px target and the placement.
 */
function BackToTop({ shown }: { shown: boolean }) {
  function toTop(e: MouseEvent<HTMLAnchorElement>) {
    const target = document.getElementById("event-content");
    if (!target) return;
    e.preventDefault();
    // `scroll-behavior` is already answerable to prefers-reduced-motion in globals.css, so
    // letting the document decide keeps one rule for the whole page.
    window.scrollTo({ top: 0 });
    requestAnimationFrame(() => target.focus({ preventScroll: true }));
  }
  return <a
    href="#event-content"
    onClick={toTop}
    className={`${styles.toTop} ${shown ? styles.toTopShown : styles.toTopHidden}`}
    aria-label="Kembali ke atas undangan"
    aria-hidden={!shown}
    tabIndex={shown ? undefined : -1}
  >
    <ArrowUp size={20} aria-hidden="true" />
  </a>;
}

function Contact({ contact }: { contact: EventRecord["contact"] }) {
  const phone = parseContactPhone(contact.phone);
  if (!phone) return null;
  const whatsapp = contact.channel === "whatsapp";
  return <div className={styles.contactPanel}>
    <h3>{contact.name}</h3>
    <p>{phone.local}</p>
    <ButtonLink href={whatsapp ? `https://wa.me/${phone.international}` : `tel:${phone.local}`} target={whatsapp ? "_blank" : undefined} rel={whatsapp ? "noopener noreferrer" : undefined}>
      {whatsapp ? "Hubungi via WhatsApp" : "Telepon PIC"}{whatsapp && <><ArrowUpRight size={18} aria-hidden="true" /><span className="sr-only"> (tab baru)</span></>}
    </ButtonLink>
  </div>;
}

function Location({ event }: { event: EventRecord }) {
  const [copyStatus, setCopyStatus] = useState("");
  const [mapFailed, setMapFailed] = useState(false);
  const mapEmbedUrl = parseLocationEmbed(event.location_embed_url ?? "");
  const showEmbed = (event.location_display ?? (event.location_embed_url ? "embed" : "manual")) === "embed";
  const photos = venuePhotos(event);
  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(`${event.venue_name}\n${event.address}`);
      setCopyStatus("Alamat tersalin.");
    } catch {
      setCopyStatus("Alamat belum dapat disalin. Pilih dan salin teks alamat di atas.");
    }
  }
  const address = <div className={styles.addressPanel}>
    <MapPin size={28} aria-hidden="true" />
    <h3>{event.venue_name || "Lokasi belum ditentukan"}</h3>
    {event.address && <address>{event.address}</address>}
    {event.arrival_notes && <p className={styles.multiline}>{event.arrival_notes}</p>}
    <div className={styles.actions}>
      {event.location_url && <ButtonLink href={event.location_url} target="_blank" rel="noopener noreferrer">Buka petunjuk lokasi <ArrowUpRight size={18} aria-hidden="true" /><span className="sr-only"> (tab baru)</span></ButtonLink>}
      {event.address && <Button variant="secondary" onClick={copyAddress}><Copy size={16} aria-hidden="true" /> Salin alamat</Button>}
    </div>
    <p className={styles.copyStatus} role="status">{copyStatus}</p>
  </div>;
  return <div className={styles.locationContent}>
    {showEmbed && mapEmbedUrl ? <div className={styles.locationMapFrame}>
      {mapFailed ? <p>Peta tidak dapat ditampilkan. {event.location_url && <a href={event.location_url} target="_blank" rel="noopener noreferrer">Buka petunjuk lokasi di Google Maps</a>}.</p> : <iframe src={mapEmbedUrl} title={`Peta lokasi ${event.venue_name || "acara"}`} loading="lazy" referrerPolicy="strict-origin-when-cross-origin" onError={() => setMapFailed(true)} />}
    </div> : address}
    {photos.length > 0 && <div className={styles.venuePhotos}>
      <h3 className={styles.venuePhotosTitle}><Images size={18} aria-hidden="true" /> Foto lokasi {event.venue_name || "acara"}</h3>
      <Gallery images={photos} label={`Foto lokasi ${event.venue_name || "acara"}`} />
    </div>}
  </div>;
}

export function EventExperience({ event, preview = false }: { event: EventRecord; preview?: boolean }) {
  const [now, setNow] = useState<number | null>(null);
  const [rsvpSaved, setRsvpSaved] = useState(false);
  // The opening should arrive uninterrupted, so the bar stays away until the guest scrolls.
  const [headerShown, setHeaderShown] = useState(false);
  // Further down than the header: a shortcut back is only worth offering once there is a way back.
  const [toTopShown, setToTopShown] = useState(false);
  useEffect(() => {
    const refresh = () => setNow(Date.now());
    refresh();
    const interval = window.setInterval(refresh, 15000);
    window.addEventListener("focus", refresh);
    return () => { window.clearInterval(interval); window.removeEventListener("focus", refresh); };
  }, []);
  useEffect(() => {
    // Reveal once the hero is behind us. Reading on scroll and acting on a threshold keeps
    // this a single cheap comparison; a reload part-way down the page shows the bar at once.
    const sync = () => {
      const y = window.scrollY;
      setHeaderShown(y > Math.min(window.innerHeight * 0.6, 520));
      // Far enough down to be worth offering, and never while the confirmation form shares the
      // lower half of the screen: a disc pinned to that corner would sit over the form's fields
      // and its submit button on a narrow phone. Measured, not assumed from a margin.
      const form = document.getElementById("rsvp")?.getBoundingClientRect();
      const clash = !!form && form.bottom > window.innerHeight * 0.5 && form.top < window.innerHeight;
      setToTopShown(y > window.innerHeight * 1.5 && !clash);
    };
    sync();
    window.addEventListener("scroll", sync, { passive: true });
    window.addEventListener("resize", sync);
    return () => { window.removeEventListener("scroll", sync); window.removeEventListener("resize", sync); };
  }, []);
  const sections = visibleSections(event);
  const rsvpOpen = now !== null && rsvpIsOpen(event, now);
  const feedbackOpen = now !== null && feedbackIsOpen(event, now);
  return <div className={styles.experience}>
    <a className={styles.skipLink} href="#event-content" onClick={focusAnchor}>Lewati navigasi</a>
    {preview && <div className={styles.preview}><Notice>Pratinjau admin — undangan ini belum tentu dipublikasikan. Pengiriman RSVP dan survei dinonaktifkan.</Notice></div>}
    <header className={`${styles.siteHeader} ${headerShown ? styles.siteHeaderShown : styles.siteHeaderHidden}`}>
      <div className={`container ${styles.headerInner}`}>
        <a href="#event-content" onClick={focusAnchor} className={styles.brand} aria-label="Werkudara — kembali ke awal undangan">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/werkudara_icon.png" width={52} height={52} alt="" />
          <span>WERKUDARA<span className={styles.brandSub}>Guest experience</span></span>
        </a>
        <nav aria-label="Bagian undangan" className={styles.navigation}>{sections.map(section => <a key={section.key} href={`#${section.key}`} onClick={focusAnchor}>{sectionLabels[section.key]}</a>)}</nav>
      </div>
    </header>
    <main id="event-content" tabIndex={-1}>
      <InvitationHero event={event} rsvpSaved={rsvpSaved} />
      {sections.map((section, index) => <RevealSection id={section.key} key={section.key} className={`${styles.section} ${section.key === "rsvp" ? styles.rsvpSection : ""}`.trimEnd()} labelledBy={`${section.key}-heading`}>
        <div className={`container ${styles.sectionGrid}`}>
          <div className={styles.sectionLabel}><span className={styles.sectionNumber}>{String(index + 1).padStart(2, "0")}</span><p className="eyebrow">{sectionLabels[section.key]}</p></div>
          <div className={styles.sectionBody}>
            {section.key === "about" && <>
              <div id="about-heading"><SectionHeading title="Bertemu, berdiskusi, menyusun langkah bersama." /></div>
              {event.introduction && <p className={`${styles.introduction} ${styles.multiline}`}>{event.introduction}</p>}
              {event.topics.length > 0 && <div className={styles.topics}><h3>Pokok pembahasan</h3><ol>{event.topics.map((topic, topicIndex) => <li key={`${topicIndex}-${topic.title}`}><span className={styles.topicNumber}>{String(topicIndex + 1).padStart(2, "0")}</span><div><h4>{topic.title}</h4>{topic.description && <p className={styles.multiline}>{topic.description}</p>}</div></li>)}</ol></div>}
            </>}
            {section.key === "agenda" && <>
              <div id="agenda-heading"><SectionHeading title="Rangkaian pertemuan"><p>Waktu ditampilkan dalam WIB.</p></SectionHeading></div>
              {event.agenda.length === 0 ? <p>Rundown belum tersedia. Silakan periksa kembali undangan ini.</p> : <ol className={styles.agenda}>{[...event.agenda].sort((a, b) => a.sort_order - b.sort_order).map(item => <li key={item.id}><div className={styles.agendaTime}><TimeRange start={item.starts_at} end={item.ends_at} timezone={event.timezone} /></div><div><h3>{item.title}</h3>{item.description && <p className={styles.multiline}>{item.description}</p>}</div></li>)}</ol>}
            </>}
            {section.key === "location" && <><div id="location-heading"><SectionHeading title="Sampai jumpa di lokasi." /></div><Location event={event} /></>}
            {section.key === "rsvp" && <>
              <div id="rsvp-heading"><SectionHeading title="Kabarkan kehadiran Anda."><p>Konfirmasi membantu panitia mempersiapkan pertemuan dan konsumsi.</p></SectionHeading></div>
              {event.rsvp_closes_at && <p className={styles.deadline}>Batas konfirmasi: {formatDate(event.rsvp_closes_at, event.timezone)}, {formatTime(event.rsvp_closes_at, event.timezone)} WIB.</p>}
              {!event.rsvp_enabled ? <Notice>Konfirmasi kehadiran belum dibuka oleh panitia.</Notice> : now !== null && !rsvpOpen && !preview ? <Notice>Konfirmasi kehadiran telah ditutup. Informasi acara tetap dapat dibaca di halaman ini.</Notice> : <RsvpForm key={event.id} event={event} disabled={preview || !rsvpOpen} onSaved={() => setRsvpSaved(true)} />}
              <noscript><p>Aktifkan JavaScript untuk mengirim konfirmasi kehadiran.</p></noscript>
            </>}
            {section.key === "contact" && event.contact && <>
              <div id="contact-heading"><SectionHeading title="Ada pertanyaan?"><p>Hubungi PIC untuk informasi lebih lanjut.</p></SectionHeading></div>
              <Contact contact={event.contact} />
            </>}
            {section.key === "feedback" && <>
              <div id="feedback-heading"><SectionHeading title="Bagaimana pengalaman Anda?"><p>Bagikan masukan untuk membantu pertemuan berikutnya.</p></SectionHeading></div>
              {preview || feedbackOpen ? <FeedbackForm key={event.id} event={event} disabled={preview || !feedbackOpen} /> : <Notice>{event.feedback_opens_at ? <>Survei dibuka pada {formatDate(event.feedback_opens_at, event.timezone)}, {formatTime(event.feedback_opens_at, event.timezone)} WIB.</> : "Survei sedang disiapkan."}</Notice>}
              <noscript><p>Aktifkan JavaScript untuk mengirim masukan.</p></noscript>
            </>}
          </div>
        </div>
      </RevealSection>)}
      <footer className={styles.closing}>
        <div className="container">
          {event.closing && <p className={`${styles.closingText} ${styles.multiline}`}>{event.closing}</p>}
          {event.organizer && <p className={styles.organizer}>{event.organizer}</p>}
          {event.review_enabled && event.review_url && <ButtonLink variant="secondary" href={event.review_url} target="_blank" rel="noopener noreferrer">Bagikan ulasan Anda <ArrowUpRight size={17} aria-hidden="true" /><span className="sr-only"> (tab baru)</span></ButtonLink>}
          <div className={styles.footerLine}><span>WERKUDARA · Guest experience</span><a href="#event-content" onClick={focusAnchor}>Kembali ke atas <ArrowUp size={15} aria-hidden="true" /></a></div>
        </div>
      </footer>
    </main>
    <BackToTop shown={toTopShown} />
  </div>;
}
