"use client";

import { ArrowUpRight, BedDouble, Bus, Car, Check, Clock3, CloudSun, Coffee, HeartPulse, MapPin, MessageCircle, Phone, Plane, Ship, TrainFront, Users, X, type LucideIcon } from "lucide-react";
import { parseContactPhone } from "@/lib/contact-phone";
import { dialNumber, type TripContent, type TripMode } from "@/lib/trip";
import { imageSrcSet } from "./Gallery";
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

function NewTab() {
  const { t } = useWording();
  return <><ArrowUpRight size={14} aria-hidden="true" /><span className="sr-only">{t("common.newTab")}</span></>;
}

export function TransportCards({ trip }: { trip: TripContent }) {
  const { t } = useWording();
  return <ul className={styles.tripLegs}>
    {trip.transport.legs.map(leg => {
      const Icon = modeIcons[leg.mode] ?? TrainFront;
      return <li key={leg.id} className={styles.tripCard}>
        <p className={styles.tripEyebrow}><Icon size={16} aria-hidden="true" /> {t(`trip.mode.${leg.mode}`)}{leg.date && <> · {leg.date}</>}</p>
        <h3>{[leg.carrier, leg.number].filter(Boolean).join(" ")}</h3>
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
      </li>;
    })}
  </ul>;
}

export function StayCard({ trip }: { trip: TripContent }) {
  const { t } = useWording();
  const stay = trip.stay;
  const [cover, ...more] = stay.photos;
  const details = <div className={`${styles.tripCard} ${cover ? styles.stayGlass : ""}`.trimEnd()}>
    <p className={styles.tripEyebrow}><BedDouble size={16} aria-hidden="true" /> {t("stay.hotel")}</p>
    <h3>{stay.name}</h3>
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
    {(stay.maps_url || stay.phone) && <div className={styles.tripActions}>
      {stay.maps_url && <a href={stay.maps_url} target="_blank" rel="noopener noreferrer"><MapPin size={16} aria-hidden="true" /> {t("stay.directions")} <NewTab /></a>}
      {stay.phone && <a href={`tel:${dialNumber(stay.phone)}`}><Phone size={16} aria-hidden="true" /> {t("stay.call")} · {stay.phone}</a>}
    </div>}
    {more.length > 0 && <div className={styles.stayThumbs}>{more.map((photo, index) => <PhotoZoom key={`${index}-${photo.url}`} image={photo} sizes="6rem" />)}</div>}
  </div>;
  if (!cover) return details;
  return <div className={styles.stayHero}>
    <div className={styles.stayBackdrop}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={cover.url} {...imageSrcSet(cover.srcset, "(max-width: 960px) 100vw, 1200px")} alt={cover.alt} loading="lazy" referrerPolicy="no-referrer" />
    </div>
    {details}
  </div>;
}

export function GuidelineLists({ trip }: { trip: TripContent }) {
  const { t } = useWording();
  const guidelines = trip.guidelines;
  return <div className={styles.tripGuidelines}>
    {guidelines.weather && <div className={styles.tripWeather}><CloudSun size={20} aria-hidden="true" /><div><h3>{t("guidelines.weather")}</h3><p className={styles.multiline}>{guidelines.weather}</p></div></div>}
    {guidelines.dos.length > 0 && <div className={styles.tripCard}>
      <h3 className={styles.tripDo}>{t("guidelines.do")}</h3>
      <ul className={styles.prepareList}>{guidelines.dos.map((line, index) => <li key={`${index}-${line}`}><Check size={15} aria-hidden="true" /> {line}</li>)}</ul>
    </div>}
    {guidelines.donts.length > 0 && <div className={styles.tripCard}>
      <h3 className={styles.tripDont}>{t("guidelines.dont")}</h3>
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
        {person.role && <p className={styles.tripEyebrow}>{person.role}</p>}
        <h3>{person.name}</h3>
        {person.phone && <div className={styles.tripActions}>
          <a href={`tel:${mobile?.local ?? dialNumber(person.phone)}`}><Phone size={16} aria-hidden="true" /> <span className="sr-only">{t("contacts.call")} {person.name}: </span>{person.phone}</a>
          {mobile && <a href={`https://wa.me/${mobile.international}`} target="_blank" rel="noopener noreferrer"><MessageCircle size={16} aria-hidden="true" /> WhatsApp<span className="sr-only"> {person.name}</span> <NewTab /></a>}
        </div>}
      </li>;
    })}</ul>}
    {contacts.hospital && <div className={styles.emergencyCard}>
      <p className={styles.emergencyTitle}><HeartPulse size={18} aria-hidden="true" /> {t("emergency.hospital")}</p>
      <div className={styles.emergencyHospital}>
        <p><strong>{contacts.hospital}</strong></p>
        {contacts.hospital_address && <p>{contacts.hospital_address}</p>}
      </div>
      {contacts.hospital_phone && <a className={styles.emergencyCall} href={`tel:${dialNumber(contacts.hospital_phone)}`}><Phone size={16} aria-hidden="true" /> <span className="sr-only">{t("contacts.call")} {contacts.hospital}: </span>{contacts.hospital_phone}</a>}
      {contacts.hospital_maps_url && <a href={contacts.hospital_maps_url} target="_blank" rel="noopener noreferrer">{t("emergency.directions")} <NewTab /></a>}
    </div>}
  </div>;
}
