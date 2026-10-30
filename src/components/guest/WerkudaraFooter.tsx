"use client";

import { ArrowUpRight, Building2, Globe, Instagram, Linkedin, Mail, MapPin, Phone, Youtube } from "lucide-react";
import { WERKUDARA, telHref } from "@/lib/werkudara";
import { useWording } from "./language";
import styles from "./guest.module.css";

/**
 * Who runs the page, as on werkudara.com: the Werkudara Group mark, its offices, how to reach it
 * and its social pages. Contacts are buttons; numbers are not printed (revision 30 Oct).
 */
export function WerkudaraFooter({ organizer }: { organizer: string }) {
  const { t } = useWording();
  const ours = !organizer || /werkudara/i.test(organizer);
  const newTab = <><ArrowUpRight size={14} aria-hidden="true" /><span className="sr-only">{t("common.newTab")}</span></>;
  return <div className={styles.wkFooter}>
    {!ours && <div className={styles.organizer}><p className="eyebrow">{t("footer.organizedBy")}</p><p className={styles.organizerName}>{organizer}</p></div>}
    <div className={styles.wkBrand}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/werkudara_icon.png" width={56} height={56} alt="" />
      <div><p className="eyebrow">{ours ? t("footer.organizedBy") : t("footer.managedBy")}</p><p className={styles.wkName}>{WERKUDARA.name}</p></div>
    </div>
    <div className={styles.wkGrid}>
      {WERKUDARA.offices.map(office => <div key={office.city} className={styles.wkBlock}>
        <p className={styles.wkLabel}><Building2 size={15} aria-hidden="true" /> {office.label}</p>
        <address>{office.address}</address>
        {office.maps && <a className={styles.wkLink} href={office.maps} target="_blank" rel="noopener noreferrer"><MapPin size={15} aria-hidden="true" /> {t("footer.map")} {newTab}</a>}
      </div>)}
      <div className={styles.wkBlock}>
        <p className={styles.wkLabel}>{t("footer.contact")}</p>
        <div className={styles.wkButtons}>
          <a href={`mailto:${WERKUDARA.email}`}><Mail size={16} aria-hidden="true" /> {t("footer.email")}</a>
          <a href={telHref(WERKUDARA.phones.office)}><Phone size={16} aria-hidden="true" /> {t("footer.callOffice")}</a>
          <a href={telHref(WERKUDARA.phones.mobile)}><Phone size={16} aria-hidden="true" /> {t("footer.callMobile")}</a>
          <a href={WERKUDARA.website} target="_blank" rel="noopener noreferrer"><Globe size={16} aria-hidden="true" /> werkudara.com {newTab}</a>
        </div>
      </div>
    </div>
    <nav className={styles.wkSocial} aria-label={t("footer.social")}>
      <a href={WERKUDARA.social.instagram} target="_blank" rel="noopener noreferrer" aria-label={`Instagram ${WERKUDARA.name}`}><Instagram size={18} aria-hidden="true" /></a>
      <a href={WERKUDARA.social.linkedin} target="_blank" rel="noopener noreferrer" aria-label={`LinkedIn ${WERKUDARA.name}`}><Linkedin size={18} aria-hidden="true" /></a>
      <a href={WERKUDARA.social.youtube} target="_blank" rel="noopener noreferrer" aria-label={`YouTube ${WERKUDARA.name}`}><Youtube size={18} aria-hidden="true" /></a>
    </nav>
  </div>;
}
