"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ArrowDown, Info, MessageCircle, Phone } from "lucide-react";
import { parseLocationEmbed } from "@/lib/location-embed";
import { defaultPhotoRatio, placeCity } from "@/lib/place-guide";
import type { EventRecord, GalleryImage, PlainImage } from "@/lib/types";
import { offersSwitch, type Lang } from "@/lib/wording";
import { localizeEvent } from "@/lib/wording/localize";
import { placeGuideText, type PlaceGuideKey } from "@/lib/wording/place-guide";
import { imageSrcSet } from "./Gallery";
import { contactLink } from "./JourneyPanels";
import { useEventLanguage } from "./language";
import { arrivalIconComponents } from "./VisitRoute";
import { garamond } from "./place-guide-font";
import styles from "./place-guide.module.css";

/** The Werkudara mark in the top bar; the page is hosted by Werkudara. */
const LOGO = "/panduan-ke-werkudara/assets/logo.webp";

type Viewing = { image: PlainImage; title: string; mode: "pan" | "fit"; hint: string };

/** The largest copy of a stored image, for the full-size viewer. */
function largest(image: PlainImage): string {
  return [...image.srcset].sort((a, b) => b.width - a.width)[0]?.url || image.url;
}

/**
 * Panduan lokasi (event_kind "panduan"): the page "Panduan ke Werkudara" built from an event. A
 * welcome over the cover photo, Getting Here (map, address, numbered turns, the host to ask, what
 * to do on arrival, Google Maps held at the bottom of the screen), and a gallery in justified rows.
 * Empty parts are left out; the map and photos open full size in one viewer.
 */
export function PlaceGuide({ event: source }: { event: EventRecord }) {
  const [lang, setLang] = useEventLanguage(source.language);
  const { event } = useMemo(() => localizeEvent(source, lang), [source, lang]);
  const w = (key: PlaceGuideKey, values?: Record<string, string>) => placeGuideText(lang, key, values);
  const [menu, setMenu] = useState(false);
  const [viewing, setViewing] = useState<Viewing | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const box = dialog.current;
    if (!box) return;
    if (viewing && !box.open) { if (typeof box.showModal === "function") box.showModal(); else box.setAttribute("open", ""); }
    if (!viewing && box.open) box.close();
  }, [viewing]);

  const { route, contact } = event;
  const embed = event.location_display === "embed" ? parseLocationEmbed(event.location_embed_url ?? "") : null;
  const link = contactLink(contact);
  const points = route.points ?? [];
  const gallery = event.gallery;
  const paragraphs = (text: string) => text.split(/\n\s*\n/).map(part => part.trim()).filter(Boolean);
  const intro = paragraphs(event.introduction);
  const galleryText = paragraphs(event.closing);
  const city = placeCity(event.address);
  const addressLines = event.address.split("\n").map(line => line.trim()).filter(Boolean);
  const openMap = () => setViewing({ image: route.map_image, title: w("mapTitle"), mode: "pan", hint: w("swipeMap") });
  const nav = [["welcome", w("welcome")], ["getting-here", w("gettingHere")], ...(gallery.length || galleryText.length ? [["gallery", w("gallery")]] : [])];

  return <div className={`${styles.page} ${garamond.variable}`} lang={lang}>
    <header className={`${styles.bar} ${menu ? styles.open : ""}`.trimEnd()}>
      <div className={styles.barIn}>
        {/* eslint-disable-next-line @next/next/no-img-element -- a fixed asset beside the static guide */}
        <a className={styles.brand} href="#welcome" aria-label={w("brand")} onClick={() => setMenu(false)}><img src={LOGO} alt="Werkudara" width={186} height={220} /></a>
        <nav className={styles.nav} id="place-nav" aria-label={w("nav")}>
          {nav.map(([id, label]) => <a key={id} href={`#${id}`} onClick={() => setMenu(false)}>{label}</a>)}
        </nav>
        <div className={styles.barTools}>
          {offersSwitch(source.language) && <div className={styles.lang} role="group" aria-label={w("langGroup")}>
            {(["id", "en"] as Lang[]).map((option, index) => <span key={option} className={styles.langItem}>
              {index > 0 && <span className={styles.langSep} aria-hidden="true">|</span>}
              <button className={styles.langBtn} type="button" lang={option} aria-pressed={lang === option} aria-label={option === "id" ? "Bahasa Indonesia" : "English"} onClick={() => setLang(option)}>{option.toUpperCase()}</button>
            </span>)}
          </div>}
          <button className={styles.menuBtn} type="button" aria-expanded={menu} aria-controls="place-nav" onClick={() => setMenu(open => !open)}>{w("menu")}</button>
        </div>
      </div>
    </header>

    <main>
      <section id="welcome" className={styles.section} aria-labelledby="place-welcome">
        {/* eslint-disable-next-line @next/next/no-img-element -- stored images with their own srcset */}
        {event.hero.url && <img className={styles.heroImg} src={event.hero.url} {...imageSrcSet(event.hero.srcset, "100vw")} alt={event.hero.alt} data-focus={event.hero.focus} fetchPriority="high" decoding="async" referrerPolicy="no-referrer" />}
        <div className={`${styles.wrap} ${styles.sec} ${styles.first}`}>
          <div className={styles.head}>
            <h1 id="place-welcome">{event.title}</h1>
            {event.subtitle && <p className={styles.sub}>{event.subtitle}</p>}
          </div>
          <div className={styles.body}>
            {event.greeting && <p className={styles.lead}>{event.greeting}</p>}
            {intro.map((part, index) => <p key={index} className={styles.multiline}>{part}</p>)}
            {(event.venue_name || city) && <div className={styles.details}><div>{event.venue_name && <p>{event.venue_name}</p>}{city && <p>{city}</p>}</div></div>}
            <a className={styles.btnOutline} href="#getting-here">{w("toRoute")} <ArrowDown size={16} aria-hidden="true" /></a>
          </div>
        </div>
      </section>

      <section id="getting-here" className={`${styles.section} ${styles.gettingHere}`} aria-labelledby="place-getting">
        <div className={`${styles.wrap} ${styles.sec}`}>
          <div className={styles.head}>
            <h2 id="place-getting">{w("gettingHere")}</h2>
            <p className={styles.sub}>{w("findingWay")}</p>
          </div>
          {route.map_image.url ? <figure className={styles.map}>
            <button className={styles.mapOpen} type="button" onClick={openMap} aria-label={w("mapAria")}>
              {/* eslint-disable-next-line @next/next/no-img-element -- stored images with their own srcset */}
              <img src={route.map_image.url} {...imageSrcSet(route.map_image.srcset, "(min-width: 1208px) 616px, 100vw")} alt={route.map_image.alt} decoding="async" referrerPolicy="no-referrer" />
            </button>
            <figcaption><button className={styles.textBtn} type="button" onClick={openMap}>{w("mapOpen")}</button></figcaption>
          </figure> : embed && <div className={`${styles.map} ${styles.embed}`}>
            <iframe src={embed} title={w("embedTitle", { place: event.venue_name })} loading="lazy" referrerPolicy="strict-origin-when-cross-origin" />
          </div>}
          <div className={styles.body}>
            {(event.venue_name || addressLines.length > 0) && <div>
              {event.venue_name && <p className={styles.label}>{event.venue_name}</p>}
              {addressLines.length > 0 && <p>{addressLines.map((line, index) => <span key={index}>{index > 0 && <br />}{line}</span>)}</p>}
            </div>}
            {event.arrival_notes && <p className={styles.multiline}>{event.arrival_notes}</p>}
            {route.steps.length > 0 && <ol className={styles.steps} aria-label={w("steps")}>
              {route.steps.map((step, index) => <li key={`${index}-${step.title}`}>
                <span className={styles.num} aria-hidden="true">{index + 1}</span>
                <div>
                  <p className={styles.stepT}>{step.title}</p>
                  {step.description && <p className={`${styles.stepS} ${styles.multiline}`}>{step.description}</p>}
                  {step.image.url && <button className={styles.stepPhoto} type="button" aria-label={w("stepPhoto")} onClick={() => setViewing({ image: step.image, title: w("photoTitle"), mode: "pan", hint: w("swipePhoto") })}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- stored images with their own srcset */}
                    <img src={step.image.url} {...imageSrcSet(step.image.srcset, "(min-width: 900px) 520px, 85vw")} alt={step.image.alt} loading="lazy" decoding="async" referrerPolicy="no-referrer" />
                  </button>}
                </div>
              </li>)}
            </ol>}
            {link && <div className={styles.pic}>
              {/* eslint-disable-next-line @next/next/no-img-element -- stored photo with its own sizes */}
              {contact.photo?.url ? <img className={styles.avatar} src={contact.photo.srcset?.[0]?.url || contact.photo.url} alt="" /> : <span className={styles.avatar} aria-hidden="true">{contact.name.trim().charAt(0).toUpperCase()}</span>}
              <div><p className={styles.picT}>{w("lost")}</p><p className={styles.picS}>{[contact.name, contact.role].filter(Boolean).join(" · ")}</p></div>
              <a className={styles.picWa} href={link.href} target={link.whatsapp ? "_blank" : undefined} rel={link.whatsapp ? "noopener noreferrer" : undefined} aria-label={w(link.whatsapp ? "whatsapp" : "call", { name: contact.name })}>
                {link.whatsapp ? <MessageCircle size={20} aria-hidden="true" /> : <Phone size={20} aria-hidden="true" />}
              </a>
            </div>}
            {points.length > 0 && <ul className={styles.points} aria-label={w("points")}>
              {points.map((point, index) => {
                const Icon = arrivalIconComponents[point.icon] ?? Info;
                return <li key={`${index}-${point.title}`}>
                  <span className={styles.ptIc} aria-hidden="true"><Icon size={18} /></span>
                  <div><p className={styles.ptT}>{point.title}</p>{point.description && <p className={`${styles.ptS} ${styles.multiline}`}>{point.description}</p>}</div>
                </li>;
              })}
            </ul>}
          </div>
          {/* Last in Getting Here and sticky: held at the bottom of the screen while the guest reads the
              way here, then left under the arrival points once the gallery comes up. */}
          {event.location_url && <div className={styles.mapsBar}>
            <a className={styles.btnSolid} href={event.location_url} target="_blank" rel="noopener noreferrer">{w("maps")}</a>
          </div>}
        </div>
      </section>

      {(gallery.length > 0 || galleryText.length > 0) && <section id="gallery" className={`${styles.section} ${styles.gallerySection}`} aria-labelledby="place-gallery">
        <div className={`${styles.wrap} ${styles.sec}`}>
          <div className={styles.head}>
            <h2 id="place-gallery">{w("gallery")}</h2>
            {event.venue_name && <p className={styles.sub}>{w("glimpse", { place: event.venue_name })}</p>}
          </div>
          {galleryText.length > 0 && <div className={styles.body}>
            {galleryText.map((part, index) => <p key={index} className={`${index === 0 ? styles.lead : ""} ${styles.multiline}`.trim()}>{part}</p>)}
          </div>}
          {gallery.length > 0 && <ul className={styles.gallery} aria-label={w("galleryAria")}>
            {gallery.map(photo => <GalleryPhoto key={photo.id} photo={photo} label={w("photoOpen", { alt: photo.alt || photo.caption })}
              onOpen={() => setViewing({ image: photo, title: w("photoTitle"), mode: "fit", hint: "" })} />)}
          </ul>}
        </div>
      </section>}
    </main>

    <dialog ref={dialog} className={`${styles.viewer} ${viewing?.mode === "fit" ? styles.fit : ""}`.trimEnd()} aria-labelledby="place-viewer-title" onClose={() => setViewing(null)}>
      <div className={styles.viewerBar}>
        <p className={styles.label} id="place-viewer-title">{viewing?.title}</p>
        <button className={styles.textBtn} type="button" onClick={() => setViewing(null)}>{w("close")}</button>
      </div>
      <div className={styles.viewerScroll}>
        {/* eslint-disable-next-line @next/next/no-img-element -- the full-size copy of a stored image */}
        {viewing && <img src={largest(viewing.image)} alt={viewing.image.alt} referrerPolicy="no-referrer" />}
      </div>
      {viewing?.hint && <p className={styles.viewerHint}>{viewing.hint}</p>}
    </dialog>
  </div>;
}

/**
 * One photo of the justified gallery. Its share of a row is its own shape, read once the photo
 * loads (stored photos carry no size), so a row of portraits and landscapes fills the width.
 */
function GalleryPhoto({ photo, label, onOpen }: { photo: GalleryImage; label: string; onOpen: () => void }) {
  const [ratio, setRatio] = useState(defaultPhotoRatio);
  const img = useRef<HTMLImageElement>(null);
  const measure = (element: HTMLImageElement | null) => {
    if (element?.naturalWidth && element.naturalHeight) setRatio(Math.round(element.naturalWidth / element.naturalHeight * 1000) / 1000);
  };
  // A photo already loaded before hydration fires no load event.
  useEffect(() => { if (img.current?.complete) measure(img.current); }, []);
  return <li style={{ "--r": ratio } as CSSProperties}>
    <button className={styles.photoOpen} type="button" aria-label={label} onClick={onOpen}>
      {/* eslint-disable-next-line @next/next/no-img-element -- stored images with their own srcset */}
      <img ref={img} src={photo.url} {...imageSrcSet(photo.srcset, "(min-width: 900px) 40vw, 70vw")} alt={photo.alt} loading="lazy" decoding="async" referrerPolicy="no-referrer" onLoad={change => measure(change.currentTarget)} />
    </button>
  </li>;
}
