import { BedDouble, CheckCircle2, ChevronRight, ClipboardList, Download, Info, LayoutDashboard, UsersRound } from "lucide-react";
import { aboutParagraphs, pointParts, type About } from "@/lib/pra-wam/about";
import { sizeLabel } from "@/lib/pra-wam/documents";
import { praWamApi, praWamPath } from "@/lib/routes";
import styles from "./beranda.module.css";

// Plain markup, usable from server pages and the super admin's client preview alike.

/**
 * "Kelola acara" on Beranda: one row, like "Apa itu WAM?", opening the panitia's own app (its
 * Dashboard). Managers see how many schedule requests wait; a BOD who reads only sees Ringkasan.
 */
export function ManageCard({ manages, openRequests }: { manages: boolean; openRequests: number }) {
  // Phone only: from 1024px the top bar has its own "Kelola acara" button.
  return <a className={`${styles.row} ${styles.manageRow}`} href={praWamPath.dashboard}>
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

/**
 * The questionnaire on Beranda, a row like "Apa itu WAM?": its name, HR's card text, the time it
 * takes and how many sections are done, with a small bar. It is mandatory, so it has no dismiss;
 * once done it thanks the person and still opens the page, to look or change until the deadline.
 */
export function QuestionnaireCard({ name, cardText, minutes, sectionsDone, sectionsTotal, done, closed, href, character }: {
  name: string; cardText: string; minutes: number; sectionsDone: number; sectionsTotal: number; done: boolean; closed: boolean; href: string;
  /** Once done and drawn: the character card instead of the tick (its picture, name and level). */
  character?: { name: string; tier: string; color: string; image: string | null } | null;
}) {
  const share = sectionsTotal ? Math.round((sectionsDone / sectionsTotal) * 100) : 0;
  return <a className={`${styles.row} ${done ? "" : styles.questRow}`} href={href}>
    {done && character
      // eslint-disable-next-line @next/next/no-img-element -- card art drawn on canvas or served privately by this site; next/image cannot help
      ? <span className={styles.questArt} style={{ borderColor: character.color }}>{character.image ? <img src={character.image} alt="" /> : <CheckCircle2 aria-hidden />}</span>
      : <span className={done ? styles.questTileDone : styles.questTile}>{done ? <CheckCircle2 aria-hidden /> : <ClipboardList aria-hidden />}</span>}
    <span className={styles.aboutText}>
      <strong>{done && character ? `Kamu ${character.name}` : name}</strong>
      {done
        ? <span className={styles.rowLine}>{character ? `${character.tier} · lihat kartu karaktermu` : "Selesai · terima kasih"}</span>
        : <>
          {cardText && <span className={styles.aboutSummary}>{cardText}</span>}
          <span className={styles.questMeta}>{closed ? "Sudah ditutup" : `Sekitar ${minutes} menit`} · {sectionsDone} dari {sectionsTotal} bagian</span>
          <span className={styles.questBar} role="progressbar" aria-label={`Progres ${name}`} aria-valuemin={0} aria-valuemax={sectionsTotal} aria-valuenow={sectionsDone} aria-valuetext={`${sectionsDone} dari ${sectionsTotal} bagian`}>
            <span style={{ width: `${share}%` }} />
          </span>
        </>}
    </span>
    <ChevronRight className={styles.chevron} aria-hidden />
  </a>;
}

/** Kartu rekan on Beranda, once the person's own card is out: a row into the gallery. */
export function ColleaguesCard({ href }: { href: string }) {
  return <a className={styles.row} href={href}>
    <span className={styles.questTileDone}><UsersRound aria-hidden /></span>
    <span className={styles.aboutText}>
      <strong>Kartu rekan</strong>
      <span className={styles.rowLine}>Lihat karakter rekan-rekanmu</span>
    </span>
    <ChevronRight className={styles.chevron} aria-hidden />
  </a>;
}

/** "Kamarmu" once HR publishes the room pairing: the room and who shares it (names and departments only). */
export function RoomCard({ room }: { room: { name: string; kind: string; roommates: { name: string; department: string }[] } }) {
  const mates = room.roommates.map(person => person.department ? `${person.name} (${person.department})` : person.name);
  return <section className={styles.row} aria-label="Kamarmu">
    <span className={styles.questTile}><BedDouble aria-hidden /></span>
    <span className={styles.aboutText}>
      <strong>Kamar {room.name}{room.kind ? ` · ${room.kind}` : ""}</strong>
      <span className={styles.rowLine}>{mates.length ? `Bersama ${mates.join(", ")}` : "Kamu sendiri di kamar ini"}</span>
    </span>
  </section>;
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
    {/* The full guide (Dokumen umum "Panduan Umum WAM"), for members only: the link asks for the login. */}
    {about.guide && <a className={`button button--secondary ${styles.aboutGuide}`} href={praWamApi.documents(about.guide.id)} target="_blank" rel="noopener">
      <Download size={18} aria-hidden />
      <span>Unduh panduan lengkap <small>PDF · {sizeLabel(about.guide.size)}</small></span>
    </a>}
  </article>;
}
