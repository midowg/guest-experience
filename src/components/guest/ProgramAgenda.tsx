"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, ChevronDown, ChevronRight, Clock3, FileText, HeartPulse, Lightbulb, MapPin, Phone } from "lucide-react";
import { localDay } from "@/lib/event-phase";
import { parseContactPhone } from "@/lib/contact-phone";
import { agendaByDay, duration, hasDepth, presentationPage } from "@/lib/program";
import type { AgendaItem, EventRecord } from "@/lib/types";
import { TimeRange } from "./InvitationHero";
import { imageSrcSet } from "./Gallery";
import { PhotoZoom } from "./PhotoZoom";
import { HighlightBody, HighlightThumb, PlaceSheet, highlightPhotos, isHighlight } from "./PlaceSheet";
import { useWording } from "./language";
import styles from "./guest.module.css";

function shortDay(day: string, timeZone: string, lang: "id" | "en") {
  return new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "id-ID", { weekday: "short", day: "numeric", month: "short", timeZone }).format(new Date(`${day}T12:00:00Z`));
}

function AgendaEntry({ event, item, expanded = false }: { event: EventRecord; item: AgendaItem; expanded?: boolean }) {
  const { t } = useWording();
  const detail = event.agenda_details?.[item.id];
  const length = duration(item.starts_at, item.ends_at);
  const page = presentationPage(event.presentation_pdf_url ?? "", detail?.pdf_page ?? null);
  // The photo sits beside the title; the box below holds only words.
  const deep = hasDepth(detail) && !!(detail!.teaser.trim() || detail!.did_you_know.trim() || detail!.more_story.trim());
  const photo = detail?.photo?.url ? detail.photo : null;
  if (detail && isHighlight(detail)) return <HighlightEntry event={event} item={item} expanded={expanded} />;
  return <li>
    <div className={styles.agendaTime}><TimeRange start={item.starts_at} end={item.ends_at} timezone={event.timezone} /></div>
    <div className={styles.agendaBody}>
      <div className={photo ? styles.agendaHead : styles.agendaText}>
        <div className={styles.agendaText}>
          <h3>{item.title}</h3>
          {item.description && <p className={styles.multiline}>{item.description}</p>}
          {(detail?.place || length) && <p className={styles.agendaFacts}>
            {detail?.place && <span><MapPin size={14} aria-hidden="true" /> {detail.place}</span>}
            {length && <span><Clock3 size={14} aria-hidden="true" /> {[length.hours ? t("duration.hours", { n: length.hours }) : "", length.minutes ? t("duration.minutes", { n: length.minutes }) : ""].filter(Boolean).join(" ")}</span>}
          </p>}
        </div>
        {photo && <PhotoZoom image={photo} className={styles.agendaThumb} sizes="8rem" />}
      </div>
      {/* Shown as it is, without a button to open it (revision 30 Oct): the guest reads it while scrolling. */}
      {/* Closed by default (revision 30 Oct): the teaser is the title; the guest opens it to read more. */}
      {deep && <details className={`${styles.didYouKnow} ${styles.noteBox}`} open={expanded || undefined}>
        <summary className={styles.noteSummary}>
          <Lightbulb size={18} aria-hidden="true" className={styles.noteIcon} />
          <span className={styles.noteTitle}>{detail!.teaser.trim() || t("detail.didYouKnow")}</span>
          <span className={styles.noteToggle} aria-hidden="true"><span className={styles.noteMore}>{t("detail.more")}</span><span className={styles.noteLess}>{t("detail.close")}</span><ChevronDown size={16} className={styles.noteChevron} /></span>
        </summary>
        <div className={styles.noteBody}>
          {detail!.did_you_know && <p className={styles.multiline}>{detail!.did_you_know}</p>}
          {detail!.more_story && <p className={styles.multiline}>{detail!.more_story}</p>}
        </div>
      </details>}
      {page && <a className={styles.pageLink} href={page} target="_blank" rel="noopener noreferrer"><FileText size={14} aria-hidden="true" /> {t("detail.page", { n: detail!.pdf_page! })}<span className="sr-only">{t("common.newTab")}</span></a>}
    </div>
  </li>;
}

/**
 * A row whose detail is a place highlight (photos, points, a note): the row stays one line with a
 * small picture, and "Lihat tempat" opens the whole highlight in a sheet. On the printed E-Guide
 * (`expanded`) the highlight is shown under the row instead.
 */
function HighlightEntry({ event, item, expanded }: { event: EventRecord; item: AgendaItem; expanded: boolean }) {
  const { t } = useWording();
  const detail = event.agenda_details[item.id];
  const length = duration(item.starts_at, item.ends_at);
  const photo = highlightPhotos(detail)[0];
  const heading = detail.place.trim() || item.title;
  const eyebrow = <><TimeRange start={item.starts_at} end={item.ends_at} timezone={event.timezone} />{detail.place && ` · ${item.title}`}</>;
  const facts = (detail.place || length) && <p className={styles.agendaFacts}>
    {detail.place && <span><MapPin size={14} aria-hidden="true" /> {detail.place}</span>}
    {length && <span><Clock3 size={14} aria-hidden="true" /> {[length.hours ? t("duration.hours", { n: length.hours }) : "", length.minutes ? t("duration.minutes", { n: length.minutes }) : ""].filter(Boolean).join(" ")}</span>}
  </p>;
  if (expanded) return <li>
    <div className={styles.agendaTime}><TimeRange start={item.starts_at} end={item.ends_at} timezone={event.timezone} /></div>
    <div className={styles.agendaBody}>
      <div className={styles.agendaText}><h3>{item.title}</h3>{item.description && <p className={styles.multiline}>{item.description}</p>}{facts}</div>
      <div className={styles.highlightPrint}><HighlightBody detail={detail} eyebrow={eyebrow} heading={heading} /></div>
    </div>
  </li>;
  return <li>
    <div className={styles.agendaTime}><TimeRange start={item.starts_at} end={item.ends_at} timezone={event.timezone} /></div>
    <PlaceSheet detail={detail} eyebrow={eyebrow} heading={heading} trigger={open => <div className={styles.agendaBody}>
      <div className={photo ? styles.agendaHead : styles.agendaText}>
        <div className={styles.agendaText}>
          <h3>{item.title}</h3>
          {item.description && <p className={styles.multiline}>{item.description}</p>}
          {facts}
          <button type="button" className={styles.highlightOpen} onClick={open} aria-haspopup="dialog">
            {t(detail.place ? "detail.openPlace" : "detail.open")}<span className="sr-only">: {heading}</span> <ChevronRight size={16} aria-hidden="true" />
          </button>
        </div>
        {photo && <HighlightThumb image={photo} label={t("detail.openLabel", { name: heading })} onOpen={open} />}
      </div>
    </div>} />
  </li>;
}

/**
 * One day's opening (the handbook's DAY 1 page): its cover picture, the day's name and one-line
 * summary, and a few tips such as what to wear and what to carry. Each part shows only when filled.
 */
function DayCover({ event, day }: { event: EventRecord; day: string }) {
  const { t } = useWording();
  const cover = event.trip?.day_covers?.find(item => item.day === day);
  if (!cover) return null;
  const tips = (cover.tips ?? []).filter(tip => tip.title.trim() || tip.text.trim());
  return <>
    {cover.image?.url && <figure className={styles.dayCover}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={cover.image.url} {...imageSrcSet(cover.image.srcset, "(max-width: 960px) 100vw, 640px")} alt={cover.image.alt} loading="lazy" referrerPolicy="no-referrer" />
    </figure>}
    {(cover.title?.trim() || cover.summary?.trim()) && <div className={styles.dayIntro}>
      {cover.title?.trim() && <h3 className={styles.dayTitle}>{cover.title}</h3>}
      {cover.summary?.trim() && <p>{cover.summary}</p>}
    </div>}
    {tips.length > 0 && <ul className={styles.dayTips} aria-label={t("program.dayTips")}>{tips.map((tip, at) => <li key={at}>
      {tip.title.trim() && <strong>{tip.title}</strong>}
      {tip.text.trim() && <span className={styles.multiline}>{tip.text}</span>}
    </li>)}</ul>}
  </>;
}

/**
 * The rundown. Over several days it becomes day tabs, opening on today during the event; each
 * item may carry a place, its length, and a "Did you know?" detail that opens in place.
 * `expanded` (the printed E-Guide): every day one after another, every detail open.
 */
export function AgendaList({ event, now, expanded = false }: { event: EventRecord; now: number | null; expanded?: boolean }) {
  const { t, lang } = useWording();
  const days = agendaByDay(event.agenda, event.timezone);
  const [active, setActive] = useState(0);
  const today = now === null ? null : localDay(now, event.timezone);
  const todayIndex = today ? days.findIndex(day => day.day === today) : -1;
  // Opening on today is set once the clock is known on the client; the server renders day 1.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (todayIndex >= 0) setActive(todayIndex); }, [todayIndex]);
  if (days.length <= 1) return <ol className={styles.agenda}>{(days[0]?.items ?? []).map(item => <AgendaEntry key={item.id} event={event} item={item} expanded={expanded} />)}</ol>;
  if (expanded) return <div className={styles.programDays}>{days.map((day, index) => <div key={day.day || index}>
    <p className={styles.dayHeading}>{t("program.day", { n: index + 1, total: days.length })}{day.day && ` · ${shortDay(day.day, event.timezone, lang)}`}</p>
    <DayCover event={event} day={day.day} />
    <ol className={styles.agenda}>{day.items.map(item => <AgendaEntry key={item.id} event={event} item={item} expanded />)}</ol>
  </div>)}</div>;
  const current = days[Math.min(active, days.length - 1)];
  return <div className={styles.programDays}>
    <div className={styles.dayTabs} role="tablist" aria-label={t("program.tabs.label")}>
      {days.map((day, index) => <button key={day.day || index} type="button" role="tab" id={`day-tab-${index}`} aria-selected={index === active} aria-controls="day-panel" onClick={() => setActive(index)}>
        <strong>{t("program.tab", { n: index + 1 })}</strong>{day.day && <span>{shortDay(day.day, event.timezone, lang)}</span>}
      </button>)}
    </div>
    <div id="day-panel" role="tabpanel" aria-labelledby={`day-tab-${active}`}>
      <p className={styles.dayHeading}>{t("program.day", { n: active + 1, total: days.length })}</p>
      <DayCover event={event} day={current.day} />
      <ol className={styles.agenda}>{current.items.map(item => <AgendaEntry key={item.id} event={event} item={item} />)}</ol>
    </div>
  </div>;
}

/** Who to call when something goes wrong, and the nearest hospital. Shown only when filled in. */
export function EmergencyCard({ event }: { event: EventRecord }) {
  const { t } = useWording();
  const emergency = event.emergency;
  const phone = emergency?.phone ? parseContactPhone(emergency.phone) : null;
  if (!emergency || (!(emergency.name && phone) && !emergency.hospital)) return null;
  return <div className={styles.emergencyCard}>
    <p className={styles.emergencyTitle}><HeartPulse size={18} aria-hidden="true" /> {t("emergency.title")}</p>
    {emergency.name && phone && <a className={styles.emergencyCall} href={`tel:${phone.local}`}><Phone size={16} aria-hidden="true" /> {t("emergency.call", { name: emergency.name })} · {phone.local}</a>}
    {emergency.hospital && <div className={styles.emergencyHospital}>
      <p><strong>{t("emergency.hospital")}:</strong> {emergency.hospital}</p>
      {emergency.hospital_address && <p>{emergency.hospital_address}</p>}
      {emergency.hospital_maps_url && <a href={emergency.hospital_maps_url} target="_blank" rel="noopener noreferrer">{t("emergency.directions")} <ArrowUpRight size={14} aria-hidden="true" /><span className="sr-only">{t("common.newTab")}</span></a>}
    </div>}
  </div>;
}
