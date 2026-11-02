"use client";

import type { ReactNode } from "react";
import { Globe, Instagram, Linkedin, Mail, MapPin, Phone, Smartphone, Youtube } from "lucide-react";
import { WERKUDARA, telHref } from "@/lib/werkudara";
import { useWording } from "./language";
import styles from "./guest.module.css";

/** One way to reach Werkudara: its icon, a small visible label, and the address or number as the link. */
function Contact({ href, icon, label, value, external }: { href: string; icon: ReactNode; label: string; value: string; external?: boolean }) {
  const { t } = useWording();
  return <li>
    <a href={href} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
      <span className={styles.wkIcon} aria-hidden="true">{icon}</span>
      <span className={styles.wkLabel}>{label}<span className="sr-only">: </span></span>
      <span className={styles.wkValue}>{value}</span>
      {external && <span className="sr-only"> {t("common.newTab")}</span>}
    </a>
  </li>;
}

/**
 * Who runs the page, as on werkudara.com: the Werkudara Group mark and office, how to reach it and
 * its social pages. Each contact carries its own visible label, so the two numbers are told apart;
 * on a wide screen the three groups sit side by side (revision 2 Nov).
 */
export function WerkudaraFooter({ organizer }: { organizer: string }) {
  const { t } = useWording();
  const ours = !organizer || /werkudara/i.test(organizer);
  return <div className={styles.wkFooter}>
    {!ours && <div className={styles.organizer}><p className="eyebrow">{t("footer.organizedBy")}</p><p className={styles.organizerName}>{organizer}</p></div>}
    <div className={styles.wkMain}>
      <div className={styles.wkBrand}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/werkudara_icon.png" width={56} height={56} alt="" />
        <div><p className="eyebrow">{ours ? t("footer.organizedBy") : t("footer.managedBy")}</p><p className={styles.wkName}>{WERKUDARA.name}</p></div>
      </div>
      <a className={styles.wkAddress} href={WERKUDARA.maps} target="_blank" rel="noopener noreferrer">
        <MapPin size={16} aria-hidden="true" />
        <span>{WERKUDARA.address}<span className={styles.wkMaps}>{t("footer.maps")}</span></span>
        <span className="sr-only">{t("common.newTab")}</span>
      </a>
    </div>
    <ul className={styles.wkContacts} aria-label={t("footer.contact")}>
      <Contact href={`mailto:${WERKUDARA.email}`} icon={<Mail size={16} />} label={t("footer.email")} value={WERKUDARA.email} />
      <Contact href={telHref(WERKUDARA.phones.office)} icon={<Phone size={16} />} label={t("footer.callOffice")} value={WERKUDARA.phones.office} />
      <Contact href={telHref(WERKUDARA.phones.mobile)} icon={<Smartphone size={16} />} label={t("footer.callMobile")} value={WERKUDARA.phones.mobile} />
      <Contact href={WERKUDARA.website} icon={<Globe size={16} />} label={t("footer.website")} value="werkudara.com" external />
    </ul>
    <nav className={styles.wkSocial} aria-label={t("footer.social")}>
      <a href={WERKUDARA.social.instagram} target="_blank" rel="noopener noreferrer" aria-label={`Instagram ${WERKUDARA.name}`}><Instagram size={18} aria-hidden="true" /></a>
      <a href={WERKUDARA.social.linkedin} target="_blank" rel="noopener noreferrer" aria-label={`LinkedIn ${WERKUDARA.name}`}><Linkedin size={18} aria-hidden="true" /></a>
      <a href={WERKUDARA.social.youtube} target="_blank" rel="noopener noreferrer" aria-label={`YouTube ${WERKUDARA.name}`}><Youtube size={18} aria-hidden="true" /></a>
    </nav>
  </div>;
}
