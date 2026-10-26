"use client";

import { useState } from "react";
import { ArrowUpRight, Copy, Images, MapPin } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui";
import { parseLocationEmbed } from "@/lib/location-embed";
import { parseContactPhone } from "@/lib/contact-phone";
import type { EventRecord } from "@/lib/types";
import { Gallery, venuePhotos } from "./Gallery";
import { PicAvatar, RouteGuideContent } from "./JourneyPanels";
import { useWording } from "./language";
import styles from "./guest.module.css";

/*
 * Parts of an event shared by the invitation (EventExperience) and the E-Guide reader
 * (GuidePage): the PIC card and the place with its map, route and photos.
 */

export function Contact({ contact }: { contact: EventRecord["contact"] }) {
  const { t } = useWording();
  const phone = parseContactPhone(contact.phone);
  if (!phone) return null;
  const whatsapp = contact.channel === "whatsapp";
  return <div className={styles.contactPanel}>
    <div className={styles.contactWho}><PicAvatar contact={contact} large /><h3>{contact.name}</h3></div>
    {contact.role && <p className={styles.contactDetail}>{contact.role}</p>}
    {contact.organization && <p className={styles.contactDetail}>{contact.organization}</p>}
    <p className={styles.contactPhone}>{phone.local}</p>
    <ButtonLink href={whatsapp ? `https://wa.me/${phone.international}` : `tel:${phone.local}`} target={whatsapp ? "_blank" : undefined} rel={whatsapp ? "noopener noreferrer" : undefined}>
      {whatsapp ? t("contact.whatsapp") : t("contact.call")}{whatsapp && <><ArrowUpRight size={18} aria-hidden="true" /><span className="sr-only">{t("common.newTab")}</span></>}
    </ButtonLink>
  </div>;
}

/** `printable`: the address panel instead of the map embed, which does not print. */
export function Location({ event, printable = false }: { event: EventRecord; printable?: boolean }) {
  const { t } = useWording();
  const place = event.venue_name || t("location.place.fallback");
  const [copyStatus, setCopyStatus] = useState("");
  const [mapFailed, setMapFailed] = useState(false);
  const mapEmbedUrl = parseLocationEmbed(event.location_embed_url ?? "");
  const showEmbed = !printable && (event.location_display ?? (event.location_embed_url ? "embed" : "manual")) === "embed";
  const photos = venuePhotos(event);
  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(`${event.venue_name}\n${event.address}`);
      setCopyStatus(t("location.copied"));
    } catch {
      setCopyStatus(t("location.copyFailed"));
    }
  }
  const address = <div className={styles.addressPanel}>
    <MapPin size={28} aria-hidden="true" />
    <h3>{event.venue_name || t("hero.place.empty")}</h3>
    {event.address && <address>{event.address}</address>}
    {event.arrival_notes && <p className={styles.multiline}>{event.arrival_notes}</p>}
    <div className={styles.actions}>
      {event.location_url && <ButtonLink href={event.location_url} target="_blank" rel="noopener noreferrer">{t("location.open")} <ArrowUpRight size={18} aria-hidden="true" /><span className="sr-only">{t("common.newTab")}</span></ButtonLink>}
      {event.address && <Button type="button" variant="secondary" onClick={copyAddress}><Copy size={16} aria-hidden="true" /> {t("location.copy")}</Button>}
    </div>
    <p className={styles.copyStatus} role="status">{copyStatus}</p>
  </div>;
  return <div className={styles.locationContent}>
    {showEmbed && mapEmbedUrl ? <div className={styles.locationMapFrame}>
      {mapFailed ? <p>{t("location.mapFailed")} {event.location_url && <a href={event.location_url} target="_blank" rel="noopener noreferrer">{t("location.openMaps")}</a>}</p> : <iframe src={mapEmbedUrl} title={t("location.mapTitle", { place })} loading="lazy" referrerPolicy="strict-origin-when-cross-origin" onError={() => setMapFailed(true)} />}
    </div> : address}
    <RouteGuideContent event={event} />
    {photos.length > 0 && <div className={styles.venuePhotos}>
      <h3 className={styles.venuePhotosTitle}><Images size={18} aria-hidden="true" /> {t("location.photos", { place })}</h3>
      <Gallery images={photos} label={t("location.photos", { place })} />
    </div>}
  </div>;
}
