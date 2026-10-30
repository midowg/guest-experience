"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, CalendarDays, ChevronRight, CircleCheck, Clock3, Home, Info, ListOrdered, MapPin, MessageCircle, Phone, Route, Users } from "lucide-react";
import { ButtonLink, Notice } from "@/components/ui";
import { getFraming } from "@/lib/hero-framing";
import { themeStyle } from "@/lib/themes";
import { timezoneInfo, zoneOf } from "@/lib/timezones";
import type { EventRecord, RsvpRecord, SectionKey } from "@/lib/types";
import { offersSwitch, type Lang } from "@/lib/wording";
import { localizeEvent } from "@/lib/wording/localize";
import { visitText, type VisitKey } from "@/lib/wording/visit";
import { CalendarButton } from "./CalendarSheet";
import type { ExperienceProps } from "./EventExperience";
import { imageSrcSet } from "./Gallery";
import { FeedbackPanel } from "./GuestForms";
import { TimeRange, visibleSections } from "./InvitationHero";
import { AfterPanel, contactLink, PicAvatar, TodayPanel, teamPoints } from "./JourneyPanels";
import { LanguageSwitch, WordingProvider, useEventLanguage, useWording } from "./language";
import { feedbackIsOpen, rsvpIsOpen } from "./form-utils";
import { AgendaList, EmergencyCard } from "./ProgramAgenda";
import { useGuestPage } from "./use-guest-page";
import { VisitRoute } from "./VisitRoute";
import { VisitRsvpDone, VisitRsvpForm } from "./VisitRsvp";
import guest from "./guest.module.css";
import styles from "./visit.module.css";

/*
 * The office-visit page (event kind "kunjungan", board 11 in docs/journey-platform.pen): a home
 * screen with the visit's facts, the confirmation and tiles to the optional parts, and a tab bar
 * for what a guest looks up again (getting here, the schedule, the host). Screens live in the
 * address hash, so the phone's back button and a shared link both land where they should.
 */

/*
 * Only the visit's own screens (board 11). Parts other templates use, such as the experience story
 * and the preparation cards, are not shown here even when an older or copied event has them on.
 */
type Screen = "beranda" | "konfirmasi" | "tentang" | "tim" | "cara-datang" | "jadwal" | "kontak";
/** Each screen shows one section of the event; the home screen shows the confirmation. */
const screenSection: Record<Screen, SectionKey> = {
  beranda: "rsvp", konfirmasi: "rsvp", tentang: "about", tim: "team", "cara-datang": "location", jadwal: "agenda", kontak: "contact",
};
/** Where the editor's "show this part" lands (live-preview areas). */
const areaScreen: Record<string, Screen> = {
  hero: "beranda", day: "beranda", rsvp: "konfirmasi", about: "tentang", team: "tim", location: "cara-datang", agenda: "jadwal", contact: "kontak",
};
/** The event the editor's preview sends to switch screens before it scrolls to a part. */
export const VISIT_AREA_EVENT = "visit:area";

const remembered = (eventId: string) => `wk_rsvp_${eventId.slice(0, 16)}`;
type Remembered = { name: string; attendance: "yes" | "no"; party?: number };

export function VisitExperience({ event: source, ...props }: ExperienceProps) {
  const [lang, setLang] = useEventLanguage(source.language);
  const { event, fallback } = useMemo(() => localizeEvent(source, lang), [source, lang]);
  return <WordingProvider lang={lang}>
    <VisitBody {...props} event={event} fallback={fallback} onLang={offersSwitch(source.language) ? setLang : undefined} />
  </WordingProvider>;
}

function VisitBody({ event, preview = false, invitation, phase: journeyPhase = "before", rsvpNeeds = true, openPartyMax = 1, photoCount = 0, previewNotice = true, fallback, onLang }: ExperienceProps & { fallback: boolean; onLang?: (lang: Lang) => void }) {
  const { lang, t, dateTime } = useWording();
  const v = (key: VisitKey, vars?: Record<string, string | number>) => visitText(lang, key, vars);
  useGuestPage(event, preview, invitation);
  // With Hari H switched off, the day itself shows the welcome screens like the days before.
  const phase = journeyPhase === "day" && event.day_enabled === false ? "before" : journeyPhase;
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const refresh = () => setNow(Date.now());
    refresh();
    const interval = window.setInterval(refresh, 15000);
    window.addEventListener("focus", refresh);
    return () => { window.clearInterval(interval); window.removeEventListener("focus", refresh); };
  }, []);

  const sections = visibleSections(event);
  const has = (key: SectionKey) => sections.some(section => section.key === key);
  const available = (screen: Screen) => screen === "beranda" || has(screenSection[screen]);
  const shownKeys = sections.map(section => section.key).join(",");
  const [screen, setScreen] = useState<Screen>("beranda");
  const heading = useRef<HTMLHeadingElement>(null);
  const first = useRef(true);
  useEffect(() => {
    const shown = new Set(shownKeys.split(","));
    const allowed = (target: Screen) => target === "beranda" || shown.has(screenSection[target]);
    const read = () => {
      const asked = window.location.hash.slice(1) as Screen;
      setScreen(asked in screenSection && allowed(asked) ? asked : "beranda");
    };
    const fromEditor = (e: Event) => {
      const target = areaScreen[(e as CustomEvent<string>).detail];
      if (target && allowed(target)) setScreen(target);
    };
    read();
    window.addEventListener("hashchange", read);
    window.addEventListener(VISIT_AREA_EVENT, fromEditor);
    return () => { window.removeEventListener("hashchange", read); window.removeEventListener(VISIT_AREA_EVENT, fromEditor); };
  }, [shownKeys]);
  // A new screen starts at its top, with the reader's focus on its title.
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    window.scrollTo({ top: 0 });
    heading.current?.focus({ preventScroll: true });
  }, [screen]);

  // On the general link, this device remembers who confirmed, so the invitation to confirm does not come back.
  const [memory, setMemory] = useState<Remembered | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [saved, setSaved] = useState<RsvpRecord | null>(invitation?.rsvp ?? null);
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (invitation || preview) return;
    try {
      const value = JSON.parse(window.localStorage.getItem(remembered(event.id)) ?? "null") as Remembered | null;
      // Restoring this device's answer after hydration; the server cannot know it.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (value?.name && (value.attendance === "yes" || value.attendance === "no")) setMemory(value);
    } catch { /* storage blocked: ask again */ }
  }, [event.id, invitation, preview]);
  function onSaved(rsvp: RsvpRecord) {
    setSaved(rsvp); setEditing(false);
    window.scrollTo({ top: 0 });
    heading.current?.focus({ preventScroll: true });
    if (invitation || preview) return;
    const value: Remembered = { name: rsvp.name, attendance: rsvp.attendance, party: rsvp.party_size ?? 1 };
    setMemory(value);
    try { window.localStorage.setItem(remembered(event.id), JSON.stringify(value)); } catch { /* storage blocked */ }
  }

  const rsvpVisible = has("rsvp") && event.rsvp_enabled;
  const rsvpOpen = now !== null && rsvpIsOpen(event, now);
  const feedbackOpen = now !== null && feedbackIsOpen(event, now);
  const shell = (children: ReactNode, tabs = true) => <div lang={lang} className={`${guest.experience} ${styles.visit}`} data-theme={event.theme?.key ?? "werkudara"} data-phase={phase} style={themeStyle(event.theme)}>
    {preview && previewNotice && <div className={guest.preview}><Notice>{t("preview.notice")}</Notice></div>}
    {fallback && <p className={guest.langFallback}>{t("lang.fallback")}</p>}
    {children}
    {tabs && <TabBar screen={screen} has={has} label={v("tabs.label")} words={{ home: v("tab.home"), route: v("tab.route"), schedule: v("tab.schedule"), contact: v("tab.contact") }} />}
  </div>;

  // After the visit: thanks, photos, the survey, a review and an invitation to work together.
  if (phase === "after") return shell(<main id="event-content" tabIndex={-1} className={styles.thanks}>
    {onLang && <div className={styles.thanksBar}><LanguageSwitch lang={lang} onChange={onLang} /></div>}
    <AfterPanel event={event} invitee={invitation?.name} photoCount={photoCount} />
    {has("feedback") && <section id="feedback" className={styles.thanksSurvey} aria-labelledby="feedback-heading">
      <h2 id="feedback-heading">{v("thanks.survey")}</h2>
      {preview || feedbackOpen ? <FeedbackPanel key={event.id} event={event} disabled={preview || !feedbackOpen} /> : <Notice>{event.feedback_opens_at ? t("feedback.opensAt", { when: dateTime(event.feedback_opens_at, event.timezone) }) : t("feedback.notReady")}</Notice>}
    </section>}
  </main>, false);

  // The general link covers a party once migration 202610270002 is in; the preview shows the full form.
  const partyMax = invitation ? invitation.party_size_max ?? 1 : preview ? 10 : openPartyMax;
  /** Why the guest cannot confirm here, if they cannot. */
  const blocked = () => {
    if (event.invitation_mode === "personal" && !invitation && !preview) return <Notice>{t("rsvp.personalOnly")}</Notice>;
    if (!event.rsvp_enabled || (now !== null && !rsvpOpen && !preview)) return <Notice>{invitation?.rsvp ? t("rsvp.locked", { answer: t(invitation.rsvp.attendance === "yes" ? "rsvp.answer.yes" : "rsvp.answer.no") }) : event.rsvp_enabled ? t("rsvp.closed") : t("rsvp.notOpen")}</Notice>;
    return null;
  };
  const answer = saved ?? (memory ? { name: memory.name, attendance: memory.attendance, party_size: memory.party ?? 1 } : null);
  const confirmation = () => {
    if (!rsvpVisible) return null;
    const notice = blocked();
    if (notice && !answer) return notice;
    if (answer) return <div className={styles.remembered} data-rsvp-done>
      <CircleCheck size={22} aria-hidden="true" />
      <div className={styles.rememberedText}>
        <p className={styles.rememberedTitle}>{answer.attendance === "yes" ? v("home.confirmed", { n: Math.max(1, answer.party_size ?? 1) }) : v("home.confirmed.no")}</p>
        <p className={styles.rememberedNote}>{v("home.confirmed.for", { name: answer.name })}{!saved && <> · {v("home.remembered.note")}</>}</p>
      </div>
      <a href="#konfirmasi" className={styles.linkButton} data-visit-nav>{v(saved ? "home.confirmed.view" : "home.other")}</a>
    </div>;
    return <>
      {event.rsvp_closes_at && <p className={styles.deadline}><Clock3 size={15} aria-hidden="true" /> {v("home.deadline", { when: dateTime(event.rsvp_closes_at, event.timezone) })}</p>}
      <ButtonLink href="#konfirmasi" data-visit-nav><CircleCheck size={19} aria-hidden="true" /> {v("home.confirm")}</ButtonLink>
    </>;
  };
  const confirmScreen = () => {
    const notice = blocked();
    if (saved && !editing) return <VisitRsvpDone event={event} rsvp={saved} personal={!!invitation} editable={!notice} now={now} v={v} hasRoute={has("location")}
      onEdit={() => { if (invitation) setEditing(true); else { setSaved(null); setFormKey(n => n + 1); } heading.current?.focus(); }} />;
    if (notice) return notice;
    return <VisitRsvpForm key={formKey} event={event} invitation={invitation} saved={invitation ? saved : null} disabled={preview || !rsvpOpen} needs={rsvpNeeds} partyMax={partyMax} v={v} onSaved={onSaved} />;
  };
  const confirmed = (saved?.attendance ?? memory?.attendance) === "yes";

  const tiles: { screen: Screen; icon: typeof Info; title: string; sub: string }[] = [
    { screen: "tentang", icon: Info, title: v("tile.about"), sub: v("tile.about.sub") },
    { screen: "jadwal", icon: ListOrdered, title: v("tile.agenda"), sub: v("tile.agenda.sub") },
    { screen: "tim", icon: Users, title: v("tile.team"), sub: v("tile.team.sub") },
  ];
  const shownTiles = tiles.filter(tile => available(tile.screen));
  const zone = timezoneInfo[zoneOf(event.timezone)];

  const home = <>
    <Cover event={event} lang={lang} onLang={onLang} />
    {phase === "day" && <TodayPanel event={event} invitee={invitation?.name} now={now} />}
    <div className={styles.body}>
      {phase !== "day" && <>
        <h1 id="event-title" className={styles.title} ref={screen === "beranda" ? heading : undefined} tabIndex={-1} data-preview-field="greeting">{invitation ? v("home.hello", { name: invitation.name }) : event.greeting || v("home.welcome")}</h1>
        <p className={styles.eventName} data-preview-field="title">{event.title}</p>
        <p className={`${styles.lead} ${guest.multiline}`} data-preview-field="subtitle">{event.subtitle || v("home.lead")}</p>
        <Facts event={event} />
      </>}
      <section id="rsvp" className={styles.confirm} aria-label={t("section.rsvp.title")}>{confirmation()}</section>
      {confirmed && has("location") && <ButtonLink variant="secondary" href="#cara-datang"><MapPin size={17} aria-hidden="true" /> {v("home.route")}</ButtonLink>}
      {shownTiles.length > 0 && <nav className={styles.explore} aria-labelledby="explore-title" data-visit-nav>
        <p id="explore-title" className={styles.exploreTitle}>{v("home.explore")}</p>
        <ul>{shownTiles.map(({ screen: target, icon: Icon, title, sub }) => <li key={target}><a href={`#${target}`} className={styles.tile}>
          <span className={styles.tileIcon} aria-hidden="true"><Icon size={19} /></span>
          <span className={styles.tileText}><strong>{title}</strong><span>{sub}</span></span>
          <ChevronRight size={18} aria-hidden="true" />
        </a></li>)}</ul>
      </nav>}
      {rsvpVisible && <p className={styles.note}>{invitation ? v("home.for", { name: invitation.name }) : v(partyMax > 1 ? "home.share.party" : "home.share")}</p>}
    </div>
  </>;

  const page = (key: SectionKey, title: string, children: ReactNode, lead?: string) => <section id={key} className={styles.page} aria-labelledby={`${key}-heading`}>
    {/* Back and the title share one row (board 11); the lead reads under the title. */}
    <div className={styles.pageHead}>
      <a href="#beranda" className={styles.back} data-visit-nav><ArrowLeft size={18} aria-hidden="true" /> <span className="sr-only">{v("back")}</span></a>
      <div id={`${key}-heading`}><h1 className={styles.pageTitle} ref={heading} tabIndex={-1}>{title}</h1>{lead && <p className={`${styles.pageLead} ${guest.multiline}`}>{lead}</p>}</div>
    </div>
    {children}
  </section>;

  const screens: Record<Screen, () => ReactNode> = {
    beranda: () => home,
    konfirmasi: () => page("rsvp", v("confirm.title"), confirmScreen(), saved && !editing ? undefined : v(partyMax > 1 ? "confirm.lead" : "confirm.leadAlone")),
    tentang: () => page("about", v("tile.about"), <>
      {event.introduction && <div className={styles.why}><h2 className={styles.whyTitle}>{v("about.why")}</h2><p className={guest.multiline}>{event.introduction}</p></div>}
      {event.topics.length > 0 && <div>
        <h2 className={styles.kicker}>{v("about.topics")}</h2>
        <ol className={styles.topics}>{event.topics.map((topic, index) => <li key={`${index}-${topic.title}`}>
          <span className={styles.topicNumber} aria-hidden="true">{index + 1}</span>
          <div><h3>{topic.title}</h3>{topic.description && <p className={guest.multiline}>{topic.description}</p>}</div>
        </li>)}</ol>
      </div>}
      {has("agenda") && <a className={styles.hint} href="#jadwal"><ListOrdered size={16} aria-hidden="true" /> {v("about.agenda")}</a>}
    </>),
    tim: () => page("team", v("tile.team"), <>
      {event.team_image?.url && <figure className={styles.teamPhoto}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={event.team_image.url} {...imageSrcSet(event.team_image.srcset, "(max-width: 600px) 100vw, 560px")} alt={event.team_image.alt} loading="lazy" referrerPolicy="no-referrer" />
      </figure>}
      <ul className={styles.values}>{teamPoints.map(({ icon: Icon, key }) => <li key={key}><span className={styles.tileIcon} aria-hidden="true"><Icon size={18} /></span><p>{t(key)}</p></li>)}</ul>
    </>, v("team.lead")),
    "cara-datang": () => page("location", v("tab.route"), <VisitRoute event={event} words={{ lost: v("route.lost"), maps: v("route.maps"), steps: v("route.steps"), arrival: v("route.arrival") }} />),
    jadwal: () => page("agenda", v("schedule.title"), <>
      {event.agenda.length === 0 ? <p>{t("section.agenda.empty")}</p> : <AgendaList event={event} now={now} />}
      <CalendarButton event={event} now={now} />
      <p className={styles.note}>{v("schedule.note")}</p>
    </>, t("section.agenda.tz", { zone: zone.label, zoneName: lang === "en" ? zone.nameEn : zone.name, offset: zone.offset })),
    kontak: () => page("contact", event.contact.heading || v("tab.contact"), <>
      <HostCard event={event} label={v("contact.host")} ask={v("contact.ask")} call={v("contact.call")} />
      <EmergencyCard event={event} />
    </>, event.contact.description || v("contact.lead")),
  };

  // The form has no tab bar (board 11, 3a/3b): its send button is the way on.
  const formShown = screen === "konfirmasi" && !(saved && !editing);
  return shell(<main id="event-content" tabIndex={-1} className={styles.main}>{screens[screen]()}</main>, !formShown);
}

/** The opening photo, with the logo in its top-left corner and the language switch opposite. */
function Cover({ event, lang, onLang }: { event: EventRecord; lang: Lang; onLang?: (lang: Lang) => void }) {
  const hero = event.hero;
  const frame = getFraming(hero).mobile;
  const bar = <div className={styles.coverBar}>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <span className={styles.logo}><img src="/werkudara_icon.png" width={24} height={28} alt="Werkudara" /></span>
    {onLang && <LanguageSwitch lang={lang} onChange={onLang} />}
  </div>;
  if (!hero.url) return <div className={styles.coverPlain} data-invitation-hero>{bar}</div>;
  return <div className={styles.cover} data-invitation-hero>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={hero.url} {...imageSrcSet(hero.srcset, "(max-width: 600px) 100vw, 560px")} alt="" aria-hidden="true" fetchPriority="high" referrerPolicy="no-referrer" style={{ objectPosition: `${frame.x}% ${frame.y}%` }} />
    {bar}
  </div>;
}

function Facts({ event }: { event: EventRecord }) {
  const { t, date } = useWording();
  return <dl className={styles.facts} data-preview-field="starts_at ends_at timezone venue_name address">
    <div><dt className="sr-only">{t("hero.date")}</dt><dd><CalendarDays size={18} aria-hidden="true" /> {event.starts_at ? date(event.starts_at, event.timezone) : t("hero.date.empty")}</dd></div>
    <div><dt className="sr-only">{t("hero.time")}</dt><dd><Clock3 size={18} aria-hidden="true" /> <span><TimeRange start={event.starts_at} end={event.ends_at} timezone={event.timezone} /></span></dd></div>
    <div><dt className="sr-only">{t("hero.place")}</dt><dd><MapPin size={18} aria-hidden="true" /> <span>{event.venue_name || t("hero.place.empty")}{event.address && <span className={styles.factAddress}>{event.address}</span>}</span></dd></div>
  </dl>;
}

/** The visit host: who they are, and one tap to ask them (WhatsApp) or call. */
function HostCard({ event, label, ask, call }: { event: EventRecord; label: string; ask: string; call: string }) {
  const { t } = useWording();
  const link = contactLink(event.contact);
  if (!link) return null;
  return <div className={styles.host}>
    <p className={styles.kicker}>{label}</p>
    <div className={styles.hostWho}>
      <PicAvatar contact={event.contact} large />
      <div><p className={styles.hostName}>{event.contact.name}</p>{(event.contact.role || event.contact.organization) && <p className={styles.hostRole}>{[event.contact.role, event.contact.organization].filter(Boolean).join(" · ")}</p>}</div>
    </div>
    <div className={styles.hostActions}>
      {link.whatsapp && <ButtonLink href={link.href} target="_blank" rel="noopener noreferrer"><MessageCircle size={18} aria-hidden="true" /> {ask}<span className="sr-only">{t("common.newTab")}</span></ButtonLink>}
      <ButtonLink variant={link.whatsapp ? "secondary" : "primary"} href={`tel:${link.local}`}><Phone size={18} aria-hidden="true" /> {call}</ButtonLink>
    </div>
  </div>;
}

/** Home, getting here, the schedule and the host: what a guest looks up again on the day. */
function TabBar({ screen, has, label, words }: { screen: Screen; has: (key: SectionKey) => boolean; label: string; words: { home: string; route: string; schedule: string; contact: string } }) {
  const tabs = [
    { target: "beranda" as Screen, icon: Home, label: words.home, on: true },
    { target: "cara-datang" as Screen, icon: Route, label: words.route, on: has("location") },
    { target: "jadwal" as Screen, icon: CalendarDays, label: words.schedule, on: has("agenda") },
    { target: "kontak" as Screen, icon: MessageCircle, label: words.contact, on: has("contact") },
  ].filter(tab => tab.on);
  if (tabs.length < 2) return null;
  // The tiles' screens belong to Home.
  const current = tabs.some(tab => tab.target === screen) ? screen : "beranda";
  return <nav className={styles.tabs} aria-label={label} data-visit-nav>
    <ul>{tabs.map(({ target, icon: Icon, label: text }) => <li key={target}>
      <a href={`#${target}`} aria-current={current === target ? "page" : undefined}><Icon size={20} aria-hidden="true" /><span>{text}</span></a>
    </li>)}</ul>
  </nav>;
}
