"use client";

import { useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { ArrowUp, ArrowUpRight } from "lucide-react";
import { ButtonLink, Notice, SectionHeading } from "@/components/ui";
import { timezoneInfo, zoneOf } from "@/lib/timezones";
import type { EventPhase, EventRecord, RsvpRecord, SectionKey } from "@/lib/types";
import { themeStyle } from "@/lib/themes";
import { imageSrcSet } from "./Gallery";
import { Contact, Location } from "./EventParts";
import { InvitationHero, visibleSections } from "./InvitationHero";
import { FeedbackPanel, RsvpPanel } from "./GuestForms";
import { feedbackIsOpen, rsvpIsOpen } from "./form-utils";
import { AfterPanel, ExperienceContent, PrepareCards, TodayPanel, teamPoints } from "./JourneyPanels";
import { LanguageSwitch, WordingProvider, useEventLanguage, useWording } from "./language";
import { localizeEvent } from "@/lib/wording/localize";
import { offersSwitch, type Lang, type WordKey } from "@/lib/wording";
import { AgendaList, EmergencyCard } from "./ProgramAgenda";
import { CalendarButton } from "./CalendarSheet";
import styles from "./guest.module.css";
import { useGuestPage } from "./use-guest-page";
import { VisitExperience } from "./VisitExperience";
import { ContactList, GuidelineLists, StayCard, TransportCards } from "./TripParts";

const navKeys: Record<SectionKey, WordKey> = { about: "nav.about", experience: "nav.experience", agenda: "nav.agenda", location: "nav.location", prepare: "nav.prepare", team: "nav.team", rsvp: "nav.rsvp", contact: "nav.contact", feedback: "nav.feedback", transport: "nav.transport", stay: "nav.stay", contacts: "nav.contacts", guidelines: "nav.guidelines" };

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
  const { t } = useWording();
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
    aria-label={t("nav.top.aria")}
    aria-hidden={!shown}
    tabIndex={shown ? undefined : -1}
  >
    <ArrowUp size={20} aria-hidden="true" />
  </a>;
}

/** After the event only what still serves the guest stays below the thank-you. */
const afterSections = new Set<SectionKey>(["feedback", "contact", "contacts"]);

/**
 * `phase` is decided by the page on the server (see lib/event-phase.ts) so the first paint is
 * already the right part of the journey; components rendered without it show the invitation.
 */
export type ExperienceProps = {
  event: EventRecord; preview?: boolean; invitation?: { name: string; token: string; short_token?: string | null; rsvp: RsvpRecord | null; party_size_max?: number }; phase?: EventPhase;
  /** False until migration 202610200004: the RSVP then asks only about allergies, as before. */
  rsvpNeeds?: boolean;
  /** People one general-link confirmation may cover; 1 until migration 202610270002. */
  openPartyMax?: number;
  /** Photos marked Tayang in the event gallery; after the event the page links to them. */
  photoCount?: number;
  /** False inside the editor's phone frame, where the "this is a preview" banner would only take space. */
  previewNotice?: boolean;
};

/** Holds the guest's language; everything below reads its words and the event's texts in it. */
export function EventExperience(props: ExperienceProps) {
  // An office visit has its own layout: a few screens with a tab bar (board 11).
  return props.event.event_kind === "kunjungan" ? <VisitExperience {...props} /> : <InvitationExperience {...props} />;
}

function InvitationExperience({ event: source, ...props }: ExperienceProps) {
  const [lang, setLang] = useEventLanguage(source.language);
  const { event, fallback } = useMemo(() => localizeEvent(source, lang), [source, lang]);
  return <WordingProvider lang={lang}>
    <ExperienceBody {...props} event={event} fallback={fallback} onLang={offersSwitch(source.language) ? setLang : undefined} />
  </WordingProvider>;
}

function ExperienceBody({ event, preview = false, invitation, phase = "before", rsvpNeeds = true, photoCount = 0, previewNotice = true, fallback, onLang }: ExperienceProps & { fallback: boolean; onLang?: (lang: Lang) => void }) {
  const { lang, t, dateTime } = useWording();
  useGuestPage(event, preview, invitation);
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
  const external = event.audience !== "internal";
  const allSections = visibleSections(event);
  const sections = phase === "after" ? allSections.filter(section => afterSections.has(section.key)) : allSections;
  const rsvpVisible = allSections.some(section => section.key === "rsvp") && event.rsvp_enabled;
  const rsvpOpen = now !== null && rsvpIsOpen(event, now);
  const feedbackOpen = now !== null && feedbackIsOpen(event, now);
  return <div lang={lang} className={styles.experience} data-theme={event.theme?.key ?? "werkudara"} data-phase={phase} style={themeStyle(event.theme)}>
    <a className={styles.skipLink} href="#event-content" onClick={focusAnchor}>{t("nav.skip")}</a>
    {preview && previewNotice && <div className={styles.preview}><Notice>{t("preview.notice")}</Notice></div>}
    <header className={`${styles.siteHeader} ${headerShown ? styles.siteHeaderShown : styles.siteHeaderHidden}`}>
      <div className={`container ${styles.headerInner}`}>
        <a href="#event-content" onClick={focusAnchor} className={styles.brand} aria-label="Werkudara — kembali ke awal undangan">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/werkudara_icon.png" width={52} height={52} alt="" />
          <span>WERKUDARA<span className={styles.brandSub}>Journey</span></span>
        </a>
        <nav aria-label={t("nav.label")} className={styles.navigation}>{sections.map(section => <a key={section.key} href={`#${section.key}`} onClick={focusAnchor}>{t(navKeys[section.key])}</a>)}</nav>
      </div>
    </header>
    {/* On the first screen, not in the header: the header only appears once the guest scrolls. */}
    {onLang && <div className={`container ${styles.langBar}`}><LanguageSwitch lang={lang} onChange={onLang} /></div>}
    <main id="event-content" tabIndex={-1}>
      {fallback && <p className={styles.langFallback}>{t("lang.fallback")}</p>}
      {phase === "day" ? <TodayPanel event={event} invitee={invitation?.name} now={now} firstSection={sections[0]?.key} />
        : phase === "after" ? <AfterPanel event={event} invitee={invitation?.name} photoCount={photoCount} />
        : <InvitationHero event={event} rsvpSaved={rsvpSaved} invitee={invitation?.name} />}
      {sections.map((section, index) => <RevealSection id={section.key} key={section.key} className={`${styles.section} ${section.key === "rsvp" ? styles.rsvpSection : ""}`.trimEnd()} labelledBy={`${section.key}-heading`}>
        <div className={`container ${styles.sectionGrid}`}>
          <div className={styles.sectionLabel}><span className={styles.sectionNumber}>{String(index + 1).padStart(2, "0")}</span><p className="eyebrow">{t(navKeys[section.key])}</p></div>
          <div className={styles.sectionBody}>
            {section.key === "about" && <>
              <div id="about-heading"><SectionHeading title={t(event.event_kind === "program" ? "section.about.title.program" : "section.about.title")} /></div>
              {event.introduction && <p className={`${styles.introduction} ${styles.multiline}`}>{event.introduction}</p>}
              {event.topics.length > 0 && <div className={styles.topics}><h3>{t("section.about.topics")}</h3><ol>{event.topics.map((topic, topicIndex) => <li key={`${topicIndex}-${topic.title}`}><span className={styles.topicNumber}>{String(topicIndex + 1).padStart(2, "0")}</span><div><h4>{topic.title}</h4>{topic.description && <p className={styles.multiline}>{topic.description}</p>}</div></li>)}</ol></div>}
            </>}
            {section.key === "experience" && <>
              <div id="experience-heading"><SectionHeading title={event.experience.title || t("section.experience.title")} /></div>
              <ExperienceContent event={event} rsvpVisible={rsvpVisible} />
            </>}
            {section.key === "agenda" && <>
              <div id="agenda-heading"><SectionHeading title={t("section.agenda.title")}><p>{t("section.agenda.tz", { zone: timezoneInfo[zoneOf(event.timezone)].label, zoneName: lang === "en" ? timezoneInfo[zoneOf(event.timezone)].nameEn : timezoneInfo[zoneOf(event.timezone)].name, offset: timezoneInfo[zoneOf(event.timezone)].offset })}</p></SectionHeading></div>
              {event.agenda.length === 0 ? <p>{t("section.agenda.empty")}</p> : <AgendaList event={event} now={now} />}
              <CalendarButton event={event} now={now} />
            </>}
            {section.key === "location" && <><div id="location-heading"><SectionHeading title={t("section.location.title")} /></div><Location event={event} /></>}
            {section.key === "prepare" && <>
              <div id="prepare-heading"><SectionHeading title={event.prepare.title || t("section.prepare.title")}>{event.prepare.intro && <p className={styles.multiline}>{event.prepare.intro}</p>}</SectionHeading></div>
              <PrepareCards items={event.prepare.items} />
            </>}
            {section.key === "transport" && <>
              <div id="transport-heading"><SectionHeading title={event.trip.transport.title || t("section.transport.title")}>{event.trip.transport.intro && <p className={styles.multiline}>{event.trip.transport.intro}</p>}</SectionHeading></div>
              <TransportCards trip={event.trip} />
            </>}
            {section.key === "stay" && <>
              <div id="stay-heading"><SectionHeading title={event.trip.stay.title || t("section.stay.title")} /></div>
              <StayCard trip={event.trip} />
            </>}
            {section.key === "guidelines" && <>
              <div id="guidelines-heading"><SectionHeading title={event.trip.guidelines.title || t("section.guidelines.title")}>{event.trip.guidelines.intro && <p className={styles.multiline}>{event.trip.guidelines.intro}</p>}</SectionHeading></div>
              <GuidelineLists trip={event.trip} />
            </>}
            {section.key === "contacts" && <>
              <div id="contacts-heading"><SectionHeading title={event.trip.contacts.title || t("section.contacts.title")}>{event.trip.contacts.intro && <p className={styles.multiline}>{event.trip.contacts.intro}</p>}</SectionHeading></div>
              <ContactList trip={event.trip} />
            </>}
            {section.key === "team" && <>
              <div id="team-heading"><SectionHeading title="Our Team"><p>{t("team.subtitle")}</p></SectionHeading></div>
              {event.team_image?.url && <figure className={styles.teamPhoto}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={event.team_image.url} {...imageSrcSet(event.team_image.srcset, "(max-width: 960px) 100vw, 852px")} alt={event.team_image.alt} loading="lazy" referrerPolicy="no-referrer" />
              </figure>}
              <ul className={styles.teamCopy}>
                {teamPoints.map(({ icon: Icon, key }) => <li key={key}><span className={styles.momentIcon} aria-hidden="true"><Icon size={18} /></span><p>{t(key)}</p></li>)}
              </ul>
            </>}
            {section.key === "rsvp" && <>
              <div id="rsvp-heading"><SectionHeading title={t("section.rsvp.title")}><p>{t("section.rsvp.sub")}</p></SectionHeading></div>
              {event.rsvp_closes_at && <p className={styles.deadline}>{t("rsvp.deadline", { when: dateTime(event.rsvp_closes_at, event.timezone) })}</p>}
              {event.invitation_mode === "personal" && !invitation && !preview ? <Notice>{t("rsvp.personalOnly")}</Notice> : !event.rsvp_enabled || (now !== null && !rsvpOpen && !preview) ? <Notice>{invitation?.rsvp ? t("rsvp.locked", { answer: t(invitation.rsvp.attendance === "yes" ? "rsvp.answer.yes" : "rsvp.answer.no") }) : event.rsvp_enabled ? t("rsvp.closed") : t("rsvp.notOpen")}</Notice> : <RsvpPanel key={event.id} event={event} disabled={preview || !rsvpOpen} invitation={invitation} needs={rsvpNeeds} onSaved={() => setRsvpSaved(true)} />}
              <noscript><p>{t("rsvp.noscript")}</p></noscript>
            </>}
            {section.key === "contact" && event.contact && <>
              <div id="contact-heading"><SectionHeading title={event.contact.heading || t("section.contact.title")}><p className={styles.multiline}>{event.contact.description || t("section.contact.sub")}</p></SectionHeading></div>
              <Contact contact={event.contact} />
              <EmergencyCard event={event} />
            </>}
            {section.key === "feedback" && <>
              <div id="feedback-heading"><SectionHeading title={t("section.feedback.title")}><p className={styles.multiline}>{event.feedback_description || t("section.feedback.sub")}</p></SectionHeading></div>
              {preview || feedbackOpen ? <FeedbackPanel key={event.id} event={event} disabled={preview || !feedbackOpen} /> : <Notice>{event.feedback_opens_at ? t("feedback.opensAt", { when: dateTime(event.feedback_opens_at, event.timezone) }) : t("feedback.notReady")}</Notice>}
              <noscript><p>{t("feedback.noscript")}</p></noscript>
            </>}
          </div>
        </div>
      </RevealSection>)}
      <footer className={styles.closing}>
        <div className="container">
          {phase !== "after" && event.closing && <p className={`${styles.closingText} ${styles.multiline}`}>{event.closing}</p>}
          {event.organizer && <p className={styles.organizer}>{event.organizer}</p>}
          {phase !== "after" && external && event.review_enabled && event.review_url && <>
            {(event.review_heading || event.review_description) && <div className={styles.reviewCallout}>
              {event.review_heading && <h2>{event.review_heading}</h2>}
              {event.review_description && <p className={styles.multiline}>{event.review_description}</p>}
            </div>}
            <ButtonLink variant="secondary" href={event.review_url} target="_blank" rel="noopener noreferrer">{event.review_button_label || t("after.review.button")} <ArrowUpRight size={17} aria-hidden="true" /><span className="sr-only">{t("common.newTab")}</span></ButtonLink>
          </>}
          <div className={styles.footerLine}><span>WERKUDARA · Journey</span><a href="#event-content" onClick={focusAnchor}>{t("nav.top")} <ArrowUp size={15} aria-hidden="true" /></a></div>
        </div>
      </footer>
    </main>
    <BackToTop shown={toTopShown} />
  </div>;
}
