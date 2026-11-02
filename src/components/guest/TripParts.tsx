"use client";

import { Ban, BedDouble, Bus, Car, Check, Clock3, CloudSun, Coffee, Droplets, HeartPulse, MapPin, MessageCircle, Phone, Plane, Ship, Siren, ThumbsUp, TrainFront, Users, X, type LucideIcon } from "lucide-react";
import { parseContactPhone } from "@/lib/contact-phone";
import { dialNumber, type TripContent, type TripMode, type TripPerson, type TripWeatherDay } from "@/lib/trip";
import { PhotoZoom } from "./PhotoZoom";
import { useWording } from "./language";
import styles from "./guest.module.css";

/**
 * The client trip's handbook parts (src/lib/trip.ts). Each shows only what the guest needs to act
 * on, and a time still to be confirmed shows as the admin wrote it, never as a guess.
 */
const modeIcons: Record<TripMode, LucideIcon> = { train: TrainFront, flight: Plane, bus: Bus, car: Car, boat: Ship };

function Fact({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  if (!value) return null;
  return <div className={styles.tripFact}><dt><Icon size={15} aria-hidden="true" /> {label}</dt><dd className={styles.multiline}>{value}</dd></div>;
}

/**
 * Every card of the handbook opens the same way (revision 30 Oct): the title on the left with its
 * icon at the right end, a short caption under it, then the content from the same left edge.
 */
function CardHead({ title, icon: Icon, meta, tone }: { title: string; icon: LucideIcon; meta?: string; tone?: "danger" }) {
  return <>
    <div className={styles.cardHead}><h3>{title}</h3><span className={`${styles.momentIcon} ${tone === "danger" ? styles.dangerIcon : ""}`.trimEnd()} aria-hidden="true"><Icon size={20} /></span></div>
    {meta && <p className={styles.tripMeta}>{meta}</p>}
  </>;
}


export function TransportCards({ trip }: { trip: TripContent }) {
  const { t } = useWording();
  return <ul className={styles.tripLegs}>
    {trip.transport.legs.map(leg => <li key={leg.id} className={styles.tripCard}>
      <CardHead title={[leg.carrier, leg.number].filter(Boolean).join(" ")} icon={modeIcons[leg.mode] ?? TrainFront} meta={[t(`trip.mode.${leg.mode}`), leg.date].filter(Boolean).join(" · ")} />
      {(leg.from || leg.to) && <p className={styles.tripRoute}>{leg.from}{leg.from && leg.to && <span aria-hidden="true"> → </span>}{leg.from && leg.to && <span className="sr-only"> {t("trip.to")} </span>}{leg.to}</p>}
      {(leg.departs || leg.arrives) && <div className={styles.tripTimes}>
        {leg.departs && <p><span>{t("trip.departs")}</span><strong>{leg.departs}</strong></p>}
        {leg.arrives && <p><span>{t("trip.arrives")}</span><strong>{leg.arrives}</strong></p>}
      </div>}
      <dl className={styles.tripFacts}>
        <Fact icon={Users} label={t("trip.seat")} value={leg.seat} />
        <Fact icon={MapPin} label={t("trip.meeting")} value={leg.meeting_point} />
        <Fact icon={Clock3} label={t("trip.meetingTime")} value={leg.meeting_time} />
      </dl>
      {leg.note && <p className={`${styles.tripNote} ${styles.multiline}`}>{leg.note}</p>}
    </li>)}
  </ul>;
}

/** The hotel as a card like the others; its photos are small pictures that open full size. */
export function StayCard({ trip }: { trip: TripContent }) {
  const { t } = useWording();
  const stay = trip.stay;
  return <div className={styles.tripCard}>
    <CardHead title={stay.name} icon={BedDouble} meta={t("stay.hotel")} />
    {stay.address && <p className={styles.multiline}>{stay.address}</p>}
    {(stay.check_in || stay.check_out) && <div className={styles.tripTimes}>
      {stay.check_in && <p><span>{t("stay.checkIn")}</span><strong>{stay.check_in}</strong></p>}
      {stay.check_out && <p><span>{t("stay.checkOut")}</span><strong>{stay.check_out}</strong></p>}
    </div>}
    <dl className={styles.tripFacts}>
      <Fact icon={Coffee} label={t("stay.breakfast")} value={[stay.breakfast_place, stay.breakfast_time].filter(Boolean).join(" · ")} />
      <Fact icon={MapPin} label={t("stay.meeting")} value={stay.meeting_point} />
    </dl>
    {stay.note && <p className={`${styles.tripNote} ${styles.multiline}`}>{stay.note}</p>}
    {stay.photos.length > 0 && <div className={styles.cardPhotos}>{stay.photos.map((photo, index) => <PhotoZoom key={`${index}-${photo.url}`} image={photo} sizes="(max-width: 960px) 33vw, 180px" />)}</div>}
    {(stay.maps_url || stay.phone) && <div className={`${styles.tripActions} ${styles.stayActions}`}>
      {stay.maps_url && <a href={stay.maps_url} target="_blank" rel="noopener noreferrer"><MapPin size={16} aria-hidden="true" /> {t("stay.directions")}<span className="sr-only"> {t("common.newTab")}</span></a>}
      {stay.phone && <a href={`tel:${dialNumber(stay.phone)}`}><Phone size={16} aria-hidden="true" /> {t("stay.call")}</a>}
    </div>}
  </div>;
}

/** One day of the forecast, read at a glance on a phone: the day, a big highest temperature, the lowest, and the chance of rain. */
function WeatherDay({ day }: { day: TripWeatherDay }) {
  const { t, lang } = useWording();
  const date = new Date(`${day.date}T12:00:00Z`);
  const locale = lang === "en" ? "en-GB" : "id-ID";
  const known = day.high !== null;
  return <li className={known ? undefined : styles.weatherUnknown}>
    <span className={styles.weatherWhen}><strong>{new Intl.DateTimeFormat(locale, { weekday: "long", timeZone: "UTC" }).format(date)}</strong> {new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: "UTC" }).format(date)}</span>
    {known ? <>
      <span className={styles.weatherTemp}>{day.high}°<span className="sr-only">C</span></span>
      {day.low !== null && <span className={styles.weatherMin}>{t("weather.min", { n: day.low })}</span>}
      {day.rain !== null && <span className={styles.weatherRain}><Droplets size={14} aria-hidden="true" /> {t("weather.rain", { n: day.rain })}<span className={styles.weatherBar} aria-hidden="true"><span style={{ width: `${Math.max(4, day.rain)}%` }} /></span></span>}
    </> : <span className={styles.weatherMin}>{t("weather.noData")}</span>}
    {day.note && <span className={styles.weatherDayNote}>{day.note}</span>}
  </li>;
}

export function GuidelineLists({ trip }: { trip: TripContent }) {
  const { t } = useWording();
  const guidelines = trip.guidelines;
  return <div className={styles.tripGuidelines}>
    {(guidelines.weather || guidelines.weather_days?.length) && <div className={styles.tripWeather}>
      <CardHead title={t("guidelines.weather")} icon={CloudSun} />
      {guidelines.weather && <p className={styles.multiline}>{guidelines.weather}</p>}
      {!!guidelines.weather_days?.length && <ul className={styles.weatherDays} aria-label={t("weather.days")}>{guidelines.weather_days.map(day => <WeatherDay key={day.date} day={day} />)}</ul>}
      {guidelines.weather_note && <p className={styles.weatherNote}>{guidelines.weather_note}</p>}
    </div>}
    {guidelines.dos.length > 0 && <div className={styles.tripCard}>
      <CardHead title={t("guidelines.do")} icon={ThumbsUp} />
      <ul className={styles.prepareList}>{guidelines.dos.map((line, index) => <li key={`${index}-${line}`}><Check size={15} aria-hidden="true" /> {line}</li>)}</ul>
    </div>}
    {guidelines.donts.length > 0 && <div className={styles.tripCard}>
      <CardHead title={t("guidelines.dont")} icon={Ban} tone="danger" />
      <ul className={`${styles.prepareList} ${styles.tripDontList}`}>{guidelines.donts.map((line, index) => <li key={`${index}-${line}`}><X size={15} aria-hidden="true" /> {line}</li>)}</ul>
    </div>}
  </div>;
}

/** Two letters for a person's badge: "Dimas Wijanarko" → "DW", "THE 1O1 Yogyakarta Tugu" → "TY". */
const initials = (name: string) => name.split(/\s+/).filter(word => /^[A-Za-z]/.test(word)).map(word => word[0].toUpperCase()).filter((_, index, all) => index === 0 || index === all.length - 1).join("").slice(0, 2);
/** 112, 110, 118, 119: a national emergency number, shown as the red bar at the end rather than as a person. */
const isEmergencyNumber = (phone: string) => /^\d{3,4}$/.test(phone.replace(/\D/g, ""));

/** One contact as a single row: badge, name and role, then the call (and WhatsApp) buttons as icons. */
function ContactRow({ name, role, detail, phone, mapsUrl, icon: Icon }: { name: string; role: string; detail?: string; phone: string; mapsUrl?: string; icon?: LucideIcon }) {
  const { t } = useWording();
  const mobile = phone ? parseContactPhone(phone) : null;
  return <li className={styles.contactRow}>
    <span className={styles.contactBadge} aria-hidden="true">{Icon ? <Icon size={18} /> : initials(name)}</span>
    <div className={styles.contactText}>
      <h4>{name}</h4>
      {role && <p>{role}</p>}
      {detail && <p>{detail}</p>}
    </div>
    <span className={styles.contactButtons}>
      {/* No number on the page (revision 30 Oct): the button calls, and the phone's dialer shows it. */}
      {phone && <a href={`tel:${mobile?.local ?? dialNumber(phone)}`} aria-label={`${t("contacts.call")} ${name}`}><Phone size={18} aria-hidden="true" /></a>}
      {mobile && <a href={`https://wa.me/${mobile.international}`} target="_blank" rel="noopener noreferrer" aria-label={`WhatsApp ${name} ${t("common.newTab")}`}><MessageCircle size={18} aria-hidden="true" /></a>}
      {mapsUrl && <a href={mapsUrl} target="_blank" rel="noopener noreferrer" aria-label={`${t("emergency.directions")} ${name} ${t("common.newTab")}`}><MapPin size={18} aria-hidden="true" /></a>}
    </span>
  </li>;
}

/**
 * Help contacts as a short list (revision 2 Nov): one row per person under small group headings, in
 * the order the admin set them. The nearest hospital joins the last group, and a national emergency
 * number closes the list as a red bar.
 */
export function ContactList({ trip }: { trip: TripContent }) {
  const { t } = useWording();
  const contacts = trip.contacts;
  const emergency = contacts.people.filter(person => isEmergencyNumber(person.phone));
  const groups: { name: string; people: TripPerson[] }[] = [];
  for (const person of contacts.people.filter(item => !isEmergencyNumber(item.phone))) {
    const name = person.group?.trim() ?? "";
    const group = groups.find(item => item.name === name);
    if (group) group.people.push(person); else groups.push({ name, people: [person] });
  }
  if (contacts.hospital && !groups.length) groups.push({ name: "", people: [] });
  return <div className={styles.contactGroups}>
    {groups.map((group, index) => <section key={group.name || index} className={styles.contactGroup}>
      {group.name && <h3>{group.name}</h3>}
      <ul>
        {group.people.map(person => <ContactRow key={person.id} name={person.name} role={person.role} phone={person.phone} />)}
        {contacts.hospital && index === groups.length - 1 && <ContactRow name={contacts.hospital} role={t("emergency.hospital")} detail={contacts.hospital_address} phone={contacts.hospital_phone} mapsUrl={contacts.hospital_maps_url} icon={HeartPulse} />}
      </ul>
    </section>)}
    {emergency.map(person => <a key={person.id} className={styles.emergencyBar} href={`tel:${dialNumber(person.phone)}`} aria-label={`${t("contacts.call")} ${person.name}`}>
      <Siren size={20} aria-hidden="true" />
      <span><strong>{person.name}</strong>{person.role && <span>{person.role}</span>}</span>
      <span className={styles.emergencyNumber} aria-hidden="true">{person.phone}</span>
    </a>)}
  </div>;
}
