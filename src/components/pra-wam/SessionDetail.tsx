import { CalendarClock, CalendarDays, ClipboardList, MapPin, Pencil, Users } from "lucide-react";
import { Notice } from "@/components/ui";
import { checkInStatus } from "@/lib/pra-wam/agenda";
import type { Room } from "@/lib/pra-wam/appraisal";
import type { PraWamDocument } from "@/lib/pra-wam/documents";
import type { ScheduleRequest } from "@/lib/pra-wam/requests";
import { sessionKindLabels, sessionStatusLabels, sessionWhen, sessionWhere, type Session } from "@/lib/pra-wam/sessions";
import { praWamPath } from "@/lib/routes";
import { CheckInBlock } from "./CheckInStatus";
import { DocumentList } from "./DocumentList";
import { RequestChange } from "./ScheduleRequests";
import { SessionActions } from "./SessionActions";
import styles from "./pra-wam.module.css";
import rows from "./peserta.module.css";

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(word => word[0]?.toUpperCase()).join("");
const FACES = 5;

type Props = {
  session: Session;
  documents: PraWamDocument[];
  storage: boolean;
  attendance: { ready: boolean; checkedInAt: string | null };
  requests: ScheduleRequest[];
  rooms: Room[];
  viewer: { name: string; manage: boolean; staff: boolean };
  now: Date;
};

/**
 * Detail sesi's content (Penpot P3): the title and its tags, the check-in status, when, where and
 * who, the material, the schedule requests, and at the bottom what the person can do next (scan
 * to check in, upload material, ask for another time; panitia: QR and attendance, change). A draft
 * says its time is not set yet. The page around it (app/wam/sessions/[id]) reads the data.
 */
export function SessionDetail({ session, documents, storage, attendance, requests, rooms, viewer, now }: Props) {
  const live = session.status === "terbit";
  const timed = !!session.startsAt && !!session.endsAt;
  const status = checkInStatus(session, attendance, now);
  const canAsk = session.isParticipant && live && timed && new Date(session.endsAt!) > now;
  const asking = requests.some(request => request.status === "diajukan");
  const canUpload = viewer.manage || (session.isParticipant && live);
  const scan = !!status && (status.kind === "buka" || status.kind === "belum");
  const people = session.participants ?? [];
  return <>
    <div className={rows.detail}>
      <div className={rows.detailHead}>
        <h1 className={rows.detailTitle}>{session.title}</h1>
        <div className={styles.pills}>
          <span className={`${styles.pill} ${styles.pillLine}`}>{sessionKindLabels[session.kind]}</span>
          {!live && <span className={`${styles.pill} ${styles.pillBrass}`}>{sessionStatusLabels[session.status]}</span>}
        </div>
        {status && <CheckInBlock status={status} now={now} />}
      </div>

      {session.status === "batal" && <Notice tone="warning">Sesi ini dibatalkan.</Notice>}
      {session.status === "draf" && <Notice tone="info">
        {timed ? "Sesi ini masih draf, belum muncul di agenda peserta." : "Jadwal belum ditentukan. Sesi ini masih draf dan belum muncul di agenda peserta."}
        {viewer.manage ? " Isi jam, ruang, dan peserta, lalu terbitkan." : ""}
      </Notice>}

      <section className={styles.card} aria-label="Rincian">
        <dl className={styles.infoList}>
          <div className={styles.row}><span className={styles.tile}><CalendarDays aria-hidden /></span><div><dt>Waktu</dt><dd>{sessionWhen(session)}</dd></div></div>
          <div className={styles.row}><span className={styles.tile}><MapPin aria-hidden /></span><div><dt>Ruang</dt><dd>{sessionWhere(session)}</dd></div></div>
          <div className={styles.row}><span className={styles.tile}><Users aria-hidden /></span><div>
            <dt>Peserta</dt>
            <dd>{session.participantCount ? `${session.participantCount} orang${session.isParticipant ? ", termasuk kamu" : ""}` : "Belum ada peserta"}</dd>
            {people.length > 0 && <div className={rows.faces} aria-hidden>
              {people.slice(0, FACES).map(person => <span key={person.id} className={rows.face} title={person.name}>{initials(person.name)}</span>)}
              {people.length > FACES && <span className={`${rows.face} ${rows.faceMore}`}>+{people.length - FACES}</span>}
            </div>}
          </div></div>
        </dl>
        {session.description && <p className={rows.description}>{session.description}</p>}
        {people.length > 0 && <details className={rows.people}>
          <summary>Lihat semua peserta</summary>
          <ul>{people.map(person => <li key={person.id}><span className={rows.face} aria-hidden>{initials(person.name)}</span><span>{person.name}{person.department && <small>{person.department}</small>}</span></li>)}</ul>
        </details>}
      </section>

      <div>
        <p className={rows.groupLabel}>Materi</p>
        <DocumentList plain documents={documents} sessionId={session.id} storage={storage} viewerName={viewer.name} uploadLabel="Unggah materi" canUpload={canUpload} />
      </div>

      {(canAsk || requests.length > 0) && timed && <RequestChange sessionId={session.id} startsAt={session.startsAt!} endsAt={session.endsAt!} rooms={rooms} requests={requests} canAsk={canAsk} />}
    </div>

    <SessionActions scanHref={scan ? praWamPath.scan : null} upload={canUpload && storage} reschedule={canAsk && !asking}>
      {viewer.staff && live && <a className="button button--secondary" href={praWamPath.sessionAttendance(session.id)}><ClipboardList size={18} aria-hidden /> QR dan daftar hadir</a>}
      {viewer.manage && <a className="button button--secondary" href={praWamPath.editSession(session.id)}><Pencil size={18} aria-hidden /> {timed ? "Ubah sesi" : "Atur jadwal"}</a>}
    </SessionActions>
  </>;
}

/** A participant's session that is not published (yet), or was cancelled: say so, not "not found". */
export function WaitingSession({ session }: { session: Pick<Session, "title" | "status" | "planFrom" | "planTo" | "startsAt" | "endsAt"> }) {
  const cancelled = session.status === "batal";
  return <>
    <h1 className={rows.detailTitle}>{session.title}</h1>
    <div className={rows.waiting}>
      <span className={styles.tile}><CalendarClock aria-hidden /></span>
      <div>
        <strong>{cancelled ? "Sesi ini dibatalkan" : "Jadwal belum ditentukan"}</strong>
        <p>{cancelled ? "Sesi ini tidak lagi ada di agenda kamu." : "Panitia belum menerbitkan sesi ini. Kamu diberi tahu begitu jadwalnya terbit."}</p>
        {!cancelled && <p className={styles.meta}>Rencana: {sessionWhen(session)}</p>}
      </div>
    </div>
    <SessionActions scanHref={null} upload={false} reschedule={false}><a className="button button--secondary" href={praWamPath.agenda}><CalendarDays size={18} aria-hidden /> Kembali ke agenda</a></SessionActions>
  </>;
}
