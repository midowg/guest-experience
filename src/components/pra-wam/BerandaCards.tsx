import { ArrowLeftRight, BarChart3, CalendarDays, ChevronRight, Info, LayoutDashboard, Send } from "lucide-react";
import { aboutParagraphs, pointParts, type About } from "@/lib/pra-wam/about";
import { praWamPath } from "@/lib/routes";
import styles from "./beranda.module.css";

// Plain markup, usable from server pages and the super admin's client preview alike.

/**
 * "Kelola acara" on Beranda (Penpot K1, "Beranda panitia"): the panitia's workspace in soft blue,
 * with what waits on them and shortcuts. Managers get Jadwal sesi, Permintaan and Pengumuman; a
 * BOD who reads only gets Ringkasan. The head opens Ringkasan operasional.
 */
export function ManageCard({ manages, openRequests, draftsWithoutTime, sessionsToday }: { manages: boolean; openRequests: number; draftsWithoutTime: number; sessionsToday: number }) {
  const shortcuts = manages
    ? [
      { href: praWamPath.sessions, label: "Jadwal sesi", icon: <CalendarDays aria-hidden />, badge: 0 },
      { href: praWamPath.requests, label: "Permintaan", icon: <ArrowLeftRight aria-hidden />, badge: openRequests },
      { href: praWamPath.announcements, label: "Pengumuman", icon: <Send aria-hidden />, badge: 0 },
    ]
    : [{ href: praWamPath.dashboard, label: "Ringkasan", icon: <BarChart3 aria-hidden />, badge: 0 }];
  return <section className={styles.manage} aria-labelledby="kelola-acara">
    <a className={styles.manageHead} href={praWamPath.dashboard}>
      <span className={styles.manageTile}><LayoutDashboard aria-hidden /></span>
      <span className={styles.manageTitle}>
        <h2 id="kelola-acara">Kelola acara</h2>
        <small>{manages ? "Ruang kerja panitia · buka ringkasan" : "Ringkasan operasional, hanya baca"}</small>
      </span>
      <ChevronRight className={styles.chevron} aria-hidden />
    </a>
    <dl className={styles.manageStats}>
      {manages && <div className={openRequests > 0 ? styles.statAlert : undefined}>
        <dt>Permintaan menunggu</dt><dd>{openRequests}</dd>
      </div>}
      <div><dt>Draf belum berjadwal</dt><dd>{draftsWithoutTime}</dd></div>
      <div><dt>Sesi hari ini</dt><dd>{sessionsToday}</dd></div>
    </dl>
    <nav className={styles.manageChips} aria-label="Pintasan kelola acara">
      {shortcuts.map(item => <a key={item.href} className={styles.manageChip} href={item.href}
        aria-label={item.badge ? `${item.label}, ${item.badge} menunggu` : undefined}>
        {item.icon}<span>{item.label}</span>{item.badge > 0 && <span className={styles.chipBadge} aria-hidden>{item.badge}</span>}
      </a>)}
    </nav>
  </section>;
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
    ? <div className={styles.about}>{inner}</div>
    : <a className={styles.about} href={praWamPath.about}>{inner}</a>;
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
