"use client";

import { ArrowUpRight, Ban, BedDouble, Bus, Car, Check, Clock3, CloudSun, Coffee, HeartPulse, MapPin, MessageCircle, Phone, Plane, Ship, ThumbsUp, TrainFront, UserRound, Users, X, type LucideIcon } from "lucide-react";
import { parseContactPhone } from "@/lib/contact-phone";
import { dialNumber, type TripContent, type TripMode } from "@/lib/trip";
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

function NewTab() {
  const { t } = useWording();
  return <><ArrowUpRight size={14} aria-hidden="true" /><span className="sr-only">{t("common.newTab")}</span></>;
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

export function GuidelineLists({ trip }: { trip: TripContent }) {
  const { t } = useWording();
  const guidelines = trip.guidelines;
  return <div className={styles.tripGuidelines}>
    {guidelines.weather && <div className={styles.tripWeather}>
      <CardHead title={t("guidelines.weather")} icon={CloudSun} />
      <p className={styles.multiline}>{guidelines.weather}</p>
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

export function ContactList({ trip }: { trip: TripContent }) {
  const { t } = useWording();
  const contacts = trip.contacts;
  return <div className={styles.tripGuidelines}>
    {contacts.people.length > 0 && <ul className={styles.tripPeople}>{contacts.people.map(person => {
      const mobile = person.phone ? parseContactPhone(person.phone) : null;
      return <li key={person.id} className={styles.tripCard}>
        <CardHead title={person.name} icon={UserRound} meta={person.role} />
        {person.phone && <div className={styles.tripActions}>
          {/* No number on the page (revision 30 Oct): the button calls, and the phone's dialer shows it. */}
          <a href={`tel:${mobile?.local ?? dialNumber(person.phone)}`}><Phone size={16} aria-hidden="true" /> {t("contacts.call")}<span className="sr-only"> {person.name}</span></a>
          {mobile && <a href={`https://wa.me/${mobile.international}`} target="_blank" rel="noopener noreferrer"><MessageCircle size={16} aria-hidden="true" /> WhatsApp<span className="sr-only"> {person.name} {t("common.newTab")}</span></a>}
        </div>}
      </li>;
    })}</ul>}
    {contacts.hospital && <div className={`${styles.tripCard} ${styles.hospitalCard}`}>
      <CardHead title={contacts.hospital} icon={HeartPulse} meta={t("emergency.hospital")} tone="danger" />
      {contacts.hospital_address && <p className={styles.multiline}>{contacts.hospital_address}</p>}
      {contacts.hospital_phone && <a className={styles.hospitalCall} href={`tel:${dialNumber(contacts.hospital_phone)}`}><Phone size={16} aria-hidden="true" /> {t("contacts.callHospital")}</a>}
      {contacts.hospital_maps_url && <a className={styles.hospitalLink} href={contacts.hospital_maps_url} target="_blank" rel="noopener noreferrer">{t("emergency.directions")} <NewTab /></a>}
    </div>}
  </div>;
}
