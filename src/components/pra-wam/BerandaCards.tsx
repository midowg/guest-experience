import { ChevronRight, Info, LayoutDashboard } from "lucide-react";
import { aboutParagraphs, pointParts, type About } from "@/lib/pra-wam/about";
import { praWamPath } from "@/lib/routes";
import styles from "./beranda.module.css";

// Plain markup, usable from server pages and the super admin's client preview alike.

/**
 * "Kelola acara" on Beranda: one row, like "Apa itu WAM?", opening the panitia's own app (its
 * Dashboard). Managers see how many schedule requests wait; a BOD who reads only sees Ringkasan.
 */
export function ManageCard({ manages, openRequests }: { manages: boolean; openRequests: number }) {
  return <a className={styles.row} href={praWamPath.dashboard}>
    <span className={styles.manageTile}><LayoutDashboard aria-hidden /></span>
    <span className={styles.aboutText}>
      <strong>Kelola acara</strong>
      <span className={styles.rowLine}>{manages ? "Ruang kerja panitia" : "Ringkasan BOD"}</span>
    </span>
    {manages && openRequests > 0 && <span className={styles.rowBadge}>{openRequests} menunggu</span>}
    <ChevronRight className={styles.chevron} aria-hidden />
  </a>;
}

/**
 * "Apa itu WAM?" on Beranda: the title and the short summary, the whole card opening the full
 * text. `preview` draws the same card without a link (the super admin's editor).
 */
export function AboutCard({ about, preview = false }: { about: Pick<About, "title" | "summary">; preview?: boolean }) {
  const inner = <>
    <span className={styles.aboutTile}><Info aria-hidden /></span>
    <span className={styles.aboutText}>
      <strong>{about.title}</strong>
      <span className={styles.aboutSummary}>{about.summary}</span>
      <span className={styles.aboutMore}>Baca selengkapnya</span>
    </span>
    <ChevronRight className={styles.chevron} aria-hidden />
  </>;
  return preview
    ? <div className={styles.row}>{inner}</div>
    : <a className={styles.row} href={praWamPath.about}>{inner}</a>;
}

/** The full text: the summary as a lead, the paragraphs, and the key points. Text only, no HTML. */
export function AboutText({ about, headingLevel = 1 }: { about: About; headingLevel?: 1 | 2 }) {
  const Heading = headingLevel === 1 ? "h1" : "h2";
  return <article className={styles.aboutPage}>
    <Heading className={styles.aboutHeading}>{about.title}</Heading>
    <p className={styles.aboutLead}>{about.summary}</p>
    {about.points.length > 0 && <ul className={styles.points} aria-label="Poin penting">
      {about.points.map((point, index) => {
        const { label, text } = pointParts(point);
        return <li key={`${index}-${point}`}>{label ? <><strong>{label}</strong><span>{text}</span></> : <span>{text}</span>}</li>;
      })}
    </ul>}
    <div className={styles.aboutBody}>{aboutParagraphs(about.body).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div>
  </article>;
}
