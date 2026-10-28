"use client";

import { Clock3, Coffee, DoorOpen, Info, MapPin, Maximize2, MessageCircle, Navigation, Phone, SquareParking, type LucideIcon } from "lucide-react";
import { parseLocationEmbed } from "@/lib/location-embed";
import type { ArrivalIcon, EventRecord, ImageSource } from "@/lib/types";
import { Gallery, imageSrcSet, venuePhotos } from "./Gallery";
import { contactLink, PicAvatar } from "./JourneyPanels";
import { useWording } from "./language";
import guest from "./guest.module.css";
import styles from "./visit-route.module.css";

/** The picture of each arrival point; the admin picks from the same set. */
export const arrivalIconComponents: Record<ArrivalIcon, LucideIcon> = { door: DoorOpen, pin: MapPin, parking: SquareParking, clock: Clock3, info: Info, coffee: Coffee };

type Picture = { url: string; alt: string; srcset: ImageSource[] };

/**
 * "Cara datang" on the office-visit page (board 11): the map as large as the screen, the address,
 * the numbered turns with their photos, the host to ask when lost, what to do on arrival, and one
 * button into Google Maps. The map is the drawn route map, else the embedded map, else the first
 * photo of the place, so the screen always opens on a picture.
 */
export function VisitRoute({ event, words }: { event: EventRecord; words: { lost: string; maps: string; steps: string; arrival: string } }) {
  const { t } = useWording();
  const { route } = event;
  const photos = venuePhotos(event);
  const embed = (event.location_display ?? (event.location_embed_url ? "embed" : "manual")) === "embed" ? parseLocationEmbed(event.location_embed_url ?? "") : null;
  const picture: Picture | null = route.map_image.url ? route.map_image : !embed && photos[0] ? photos[0] : null;
  // The photo used as the map is not shown again below.
  const morePhotos = picture && !route.map_image.url ? photos.slice(1) : photos;
  const link = contactLink(event.contact);
  const points = route.points ?? [];

  return <div className={styles.route}>
    {picture ? <figure className={styles.map}>
      {/* eslint-disable-next-line @next/next/no-img-element -- stored images with their own srcset */}
      <img src={picture.url} {...imageSrcSet(picture.srcset, "(max-width: 600px) 100vw, 560px")} alt={picture.alt} referrerPolicy="no-referrer" />
      <a className={styles.zoom} href={picture.url} target="_blank" rel="noopener noreferrer"><Maximize2 size={14} aria-hidden="true" /> {t("location.zoom")}<span className="sr-only">{t("common.newTab")}</span></a>
    </figure> : embed && <div className={styles.map}>
      <iframe src={embed} title={t("location.mapTitle", { place: event.venue_name || t("location.place.fallback") })} loading="lazy" referrerPolicy="strict-origin-when-cross-origin" />
    </div>}

    {(event.address || event.venue_name) && <p className={styles.address}>{event.address || event.venue_name}</p>}
    {event.arrival_notes && <p className={`${styles.note} ${guest.multiline}`}>{event.arrival_notes}</p>}

    {route.steps.length > 0 && <ol className={styles.steps} aria-label={words.steps}>
      {route.steps.map((step, index) => <li key={`${index}-${step.title}`}>
        <span className={styles.number} aria-hidden="true">{index + 1}</span>
        <div className={styles.stepText}>
          <h2>{step.title}</h2>
          {step.description && <p className={guest.multiline}>{step.description}</p>}
          {/* eslint-disable-next-line @next/next/no-img-element -- stored images with their own srcset */}
          {step.image.url && <img className={styles.stepPhoto} src={step.image.url} {...imageSrcSet(step.image.srcset, "(max-width: 600px) 80vw, 480px")} alt={step.image.alt} loading="lazy" referrerPolicy="no-referrer" />}
        </div>
      </li>)}
    </ol>}

    {link && <div className={styles.pic}>
      <PicAvatar contact={event.contact} />
      <div className={styles.picText}>
        <p className={styles.picTitle}>{words.lost}</p>
        {event.contact.role && <p className={styles.picRole}>{event.contact.role}</p>}
      </div>
      <a className={styles.picAction} href={link.href} target={link.whatsapp ? "_blank" : undefined} rel={link.whatsapp ? "noopener noreferrer" : undefined}
        aria-label={link.whatsapp ? `${t("contact.whatsapp.aria", { name: event.contact.name })}${t("common.newTab")}` : t("contact.call.aria", { name: event.contact.name })}>
        {link.whatsapp ? <MessageCircle size={20} aria-hidden="true" /> : <Phone size={20} aria-hidden="true" />}
      </a>
    </div>}

    {points.length > 0 && <ul className={styles.points} aria-label={words.arrival}>
      {points.map((point, index) => {
        const Icon = arrivalIconComponents[point.icon] ?? Info;
        return <li key={`${index}-${point.title}`}>
          <span className={styles.pointIcon} aria-hidden="true"><Icon size={18} /></span>
          <div><h2>{point.title}</h2>{point.description && <p className={guest.multiline}>{point.description}</p>}</div>
        </li>;
      })}
    </ul>}

    {event.location_url && <a className={styles.maps} href={event.location_url} target="_blank" rel="noopener noreferrer"><Navigation size={20} aria-hidden="true" /> {words.maps}<span className="sr-only">{t("common.newTab")}</span></a>}

    {morePhotos.length > 0 && <Gallery images={morePhotos} label={t("location.photos", { place: event.venue_name || t("location.place.fallback") })} />}
  </div>;
}
