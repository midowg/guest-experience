"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, Download, Maximize2, MessageCircle, X } from "lucide-react";
import { parseContactPhone } from "@/lib/contact-phone";
import type { GalleryPhoto } from "@/lib/gallery";
import { whatsappUrl } from "@/lib/invitation-messages";
import { themeStyle } from "@/lib/themes";
import type { EventRecord } from "@/lib/types";
import { LanguageSwitch, useEventLanguage, useWording, WordingProvider } from "./language";
import styles from "./guest.module.css";
import { eventPath, photoDownloadPath } from "@/lib/routes";

type Props = { event: EventRecord; photos: GalleryPhoto[]; closed: boolean };

/** The event's photo gallery for guests: ready photos only, a larger view, and the original. */
export function PhotoGallery(props: Props) {
  const [lang, setLang] = useEventLanguage(props.event.language);
  return <WordingProvider lang={lang}><GalleryBody {...props} lang={lang} setLang={setLang} /></WordingProvider>;
}

function GalleryBody({ event, photos, closed, lang, setLang }: Props & { lang: "id" | "en"; setLang: (lang: "id" | "en") => void }) {
  const { t } = useWording();
  const [open, setOpen] = useState<number | null>(null);
  const close = useRef<HTMLButtonElement>(null);
  const phone = parseContactPhone(event.contact.phone)?.international ?? null;
  const title = lang === "en" && event.translations?.en?.title ? event.translations.en.title : event.title;

  useEffect(() => {
    if (open === null) return;
    close.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
      if (e.key === "ArrowRight") setOpen(index => index === null ? null : Math.min(photos.length - 1, index + 1));
      if (e.key === "ArrowLeft") setOpen(index => index === null ? null : Math.max(0, index - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, photos.length]);

  const photo = open === null ? null : photos[open];
  const page = typeof window === "undefined" ? "" : window.location.href.split("#")[0];
  return <div lang={lang} className={styles.experience} data-theme={event.theme?.key ?? "werkudara"} style={themeStyle(event.theme)}>
    <main className={`container ${styles.photoPage}`}>
      <div className={styles.photoTop}>
        <a href={eventPath(event)} className={styles.photoBack}><ArrowLeft size={16} aria-hidden="true" /> {t("photos.back")}</a>
        {event.language === "id_en" && <LanguageSwitch lang={lang} onChange={setLang} />}
      </div>
      <p className="eyebrow">{title}</p>
      <h1>{t("photos.title")}</h1>
      {closed ? <p>{t("photos.closed")}</p> : photos.length === 0 ? <p>{t("photos.empty")}</p> : <>
        <p>{t("photos.intro")}</p>
        <p className={styles.photoCount}>{t("photos.count", { n: photos.length })}</p>
        <ul className={styles.photoGrid}>
          {photos.map((item, index) => <li key={item.id}>
            <button type="button" onClick={() => setOpen(index)} aria-label={`${t("gallery.photo", { n: index + 1 })}${item.caption ? `: ${item.caption}` : ""}`}>
              {/* eslint-disable-next-line @next/next/no-img-element -- signed storage address */}
              <img src={item.thumb_url} alt="" loading="lazy" width={item.width ?? undefined} height={item.height ?? undefined} />
              <span className={styles.photoGridView} aria-hidden="true"><Maximize2 size={13} /> {lang === "en" ? "View" : "Lihat"}</span>
            </button>
          </li>)}
        </ul>
      </>}
    </main>
    {photo && open !== null && <div className={styles.photoViewer} role="dialog" aria-modal="true" aria-label={t("gallery.photo", { n: open + 1 })}>
      <div className={styles.photoViewerBar}>
        <button ref={close} type="button" onClick={() => setOpen(null)} aria-label={t("button.close")}><X size={20} aria-hidden="true" /></button>
        <span>{t("gallery.position", { n: open + 1, total: photos.length })}</span>
        <a href={photoDownloadPath(event, photo.id)} aria-label={t("gallery.original")}><Download size={20} aria-hidden="true" /></a>
      </div>
      <figure>
        {/* eslint-disable-next-line @next/next/no-img-element -- signed storage address */}
        <img src={photo.large_url} alt={photo.alt || photo.caption || t("gallery.photo", { n: open + 1 })} />
        {photo.caption && <figcaption>{photo.caption}</figcaption>}
      </figure>
      <div className={styles.photoViewerActions}>
        <button type="button" disabled={open === 0} onClick={() => setOpen(open - 1)} aria-label={t("gallery.prev")}><ChevronLeft size={20} aria-hidden="true" /></button>
        <button type="button" disabled={open === photos.length - 1} onClick={() => setOpen(open + 1)} aria-label={t("gallery.next")}><ChevronRight size={20} aria-hidden="true" /></button>
      </div>
      {phone && <a className={styles.photoRemove} href={whatsappUrl(phone, t("photos.removeMessage", { n: open + 1, event: title, link: page }))} target="_blank" rel="noopener noreferrer">
          <MessageCircle size={16} aria-hidden="true" /> {t("photos.remove")}<span className="sr-only">{t("common.newTab")}</span>
        </a>}
    </div>}
  </div>;
}
