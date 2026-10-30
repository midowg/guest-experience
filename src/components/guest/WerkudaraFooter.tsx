"use client";

import { Globe, Instagram, Linkedin, Mail, MapPin, Phone, Youtube } from "lucide-react";
import { WERKUDARA, telHref } from "@/lib/werkudara";
import { useWording } from "./language";
import styles from "./guest.module.css";

/**
 * Who runs the page, as on werkudara.com: the Werkudara Group mark, its offices, how to reach it
 * and its social pages. Email and numbers are printed and each is a link (revision 30 Oct).
 */
export function WerkudaraFooter({ organizer }: { organizer: string }) {
  const { t } = useWording();
  const ours = !organizer || /werkudara/i.test(organizer);
  const newTab = <span className="sr-only">{t("common.newTab")}</span>;
  return <div className={styles.wkFooter}>
    {!ours && <div className={styles.organizer}><p className="eyebrow">{t("footer.organizedBy")}</p><p className={styles.organizerName}>{organizer}</p></div>}
    <div className={styles.wkBrand}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/werkudara_icon.png" width={56} height={56} alt="" />
      <div><p className="eyebrow">{ours ? t("footer.organizedBy") : t("footer.managedBy")}</p><p className={styles.wkName}>{WERKUDARA.name}</p></div>
    </div>
    <a className={styles.wkAddress} href={WERKUDARA.maps} target="_blank" rel="noopener noreferrer"><MapPin size={15} aria-hidden="true" /><span>{WERKUDARA.address}</span>{newTab}</a>
    <ul className={styles.wkContacts} aria-label={t("footer.contact")}>
      <li><a href={`mailto:${WERKUDARA.email}`}><Mail size={15} aria-hidden="true" /><span className="sr-only">{t("footer.email")}: </span>{WERKUDARA.email}</a></li>
      <li><a href={telHref(WERKUDARA.phones.office)}><Phone size={15} aria-hidden="true" /><span className="sr-only">{t("footer.callOffice")}: </span>{WERKUDARA.phones.office}</a></li>
      <li><a href={telHref(WERKUDARA.phones.mobile)}><Phone size={15} aria-hidden="true" /><span className="sr-only">{t("footer.callMobile")}: </span>{WERKUDARA.phones.mobile}</a></li>
      <li><a href={WERKUDARA.website} target="_blank" rel="noopener noreferrer"><Globe size={15} aria-hidden="true" /> werkudara.com{newTab}</a></li>
    </ul>
    <nav className={styles.wkSocial} aria-label={t("footer.social")}>
      <a href={WERKUDARA.social.instagram} target="_blank" rel="noopener noreferrer" aria-label={`Instagram ${WERKUDARA.name}`}><Instagram size={18} aria-hidden="true" /></a>
      <a href={WERKUDARA.social.linkedin} target="_blank" rel="noopener noreferrer" aria-label={`LinkedIn ${WERKUDARA.name}`}><Linkedin size={18} aria-hidden="true" /></a>
      <a href={WERKUDARA.social.youtube} target="_blank" rel="noopener noreferrer" aria-label={`YouTube ${WERKUDARA.name}`}><Youtube size={18} aria-hidden="true" /></a>
    </nav>
  </div>;
}
