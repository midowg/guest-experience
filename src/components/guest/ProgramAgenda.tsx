"use client";

import { useEffect, useId, useState } from "react";
import { ArrowUpRight, ChevronDown, Clock3, FileText, HeartPulse, Lightbulb, MapPin, Phone } from "lucide-react";
import { localDay } from "@/lib/event-phase";
import { parseContactPhone } from "@/lib/contact-phone";
import { agendaByDay, duration, hasDepth, presentationPage } from "@/lib/program";
import type { AgendaItem, EventRecord } from "@/lib/types";
import { TimeRange } from "./InvitationHero";
import { useWording } from "./language";
import styles from "./guest.module.css";

function shortDay(day: string, timeZone: string, lang: "id" | "en") {
  return new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "id-ID", { weekday: "short", day: "numeric", month: "short", timeZone }).format(new Date(`${day}T12:00:00Z`));
}

function AgendaEntry({ event, item }: { event: EventRecord; item: AgendaItem }) {
  const { t } = useWording();
  const panel = useId();
  const [open, setOpen] = useState(false);
  const [story, setStory] = useState(false);
  const detail = event.agenda_details?.[item.id];
  const length = duration(item.starts_at, item.ends_at);
  const page = presentationPage(event.presentation_pdf_url ?? "", detail?.pdf_page ?? null);
  const deep = hasDepth(detail);
  return <li>
    <div className={styles.agendaTime}><TimeRange start={item.starts_at} end={item.ends_at} timezone={event.timezone} /></div>
    <div className={styles.agendaBody}>
      <h3>{item.title}</h3>
      {item.description && <p className={styles.multiline}>{item.description}</p>}
      {(detail?.place || length) && <p className={styles.agendaFacts}>
        {detail?.place && <span><MapPin size={14} aria-hidden="true" /> {detail.place}</span>}
        {length && <span><Clock3 size={14} aria-hidden="true" /> {[length.hours ? t("duration.hours", { n: length.hours }) : "", length.minutes ? t("duration.minutes", { n: length.minutes }) : ""].filter(Boolean).join(" ")}</span>}
      </p>}
      {deep && <button type="button" className={styles.discover} aria-expanded={open} aria-controls={panel} onClick={() => setOpen(!open)}>
        <span>{detail!.teaser ? t("detail.discover", { teaser: detail!.teaser }) : t("detail.more")}</span>
        <ChevronDown size={16} aria-hidden="true" className={open ? styles.discoverOpen : undefined} />
      </button>}
      {deep && open && <div id={panel} className={styles.discoverPanel}>
        {detail!.did_you_know && <div className={styles.didYouKnow}><p className={styles.didYouKnowTitle}><Lightbulb size={16} aria-hidden="true" /> {t("detail.didYouKnow")}</p><p className={styles.multiline}>{detail!.did_you_know}</p></div>}
        {detail!.more_story && <>
          {story && <p className={styles.multiline}>{detail!.more_story}</p>}
          <button type="button" className={styles.textButton} aria-expanded={story} onClick={() => setStory(!story)}>{story ? t("detail.moreLess") : t("detail.more")}</button>
        </>}
      </div>}
      {page && <a className={styles.pageLink} href={page} target="_blank" rel="noopener noreferrer"><FileText size={14} aria-hidden="true" /> {t("detail.page", { n: detail!.pdf_page! })}<span className="sr-only">{t("common.newTab")}</span></a>}
    </div>
  </li>;
}

/**
 * The rundown. Over several days it becomes day tabs, opening on today during the event; each
 * item may carry a place, its length, and a "Did you know?" detail that opens in place.
 */
export function AgendaList({ event, now }: { event: EventRecord; now: number | null }) {
  const { t, lang } = useWording();
  const days = agendaByDay(event.agenda, event.timezone);
  const [active, setActive] = useState(0);
  const today = now === null ? null : localDay(now, event.timezone);
  const todayIndex = today ? days.findIndex(day => day.day === today) : -1;
  // Opening on today is set once the clock is known on the client; the server renders day 1.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (todayIndex >= 0) setActive(todayIndex); }, [todayIndex]);
  if (days.length <= 1) return <ol className={styles.agenda}>{(days[0]?.items ?? []).map(item => <AgendaEntry key={item.id} event={event} item={item} />)}</ol>;
  const current = days[Math.min(active, days.length - 1)];
  return <div className={styles.programDays}>
    <div className={styles.dayTabs} role="tablist" aria-label={t("program.tabs.label")}>
      {days.map((day, index) => <button key={day.day || index} type="button" role="tab" id={`day-tab-${index}`} aria-selected={index === active} aria-controls="day-panel" onClick={() => setActive(index)}>
        <strong>{t("program.tab", { n: index + 1 })}</strong>{day.day && <span>{shortDay(day.day, event.timezone, lang)}</span>}
      </button>)}
    </div>
    <div id="day-panel" role="tabpanel" aria-labelledby={`day-tab-${active}`}>
      <p className={styles.dayHeading}>{t("program.day", { n: active + 1, total: days.length })}</p>
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
