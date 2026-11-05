import { CalendarClock, CalendarDays, ClipboardList, MapPin, Pencil, Users } from "lucide-react";
import { Notice } from "@/components/ui";
import { checkInStatus, type SessionView } from "@/lib/pra-wam/agenda";
import { bookingSessionLabel, sessionKindLabels, sessionStatusLabels, sessionWhen, sessionWhere, type Session } from "@/lib/pra-wam/sessions";
import { praWamPath } from "@/lib/routes";
import { CheckInBlock } from "./CheckInStatus";
import { DocumentList } from "./DocumentList";
import { RequestChange } from "./ScheduleRequests";
import { SelfCheckIn } from "./SelfCheckIn";
import { SessionActions } from "./SessionActions";
import styles from "./pra-wam.module.css";
import rows from "./peserta.module.css";

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(word => word[0]?.toUpperCase()).join("");
const FACES = 5;

type Props = { view: Extract<SessionView, { kind: "sesi" }>; now: Date };

/** What the person can do with the session, read the same way by the content and the action bar. */
function rights({ view: { session, attendance, requests, viewer, storage }, now }: Props) {
  const live = session.status === "terbit";
  const timed = !!session.startsAt && !!session.endsAt;
  const status = checkInStatus(session, attendance, now);
  // A booking's session moves with its booking (the server refuses a request for it), so no "Ganti jadwal".
  const canAsk = session.isParticipant && live && timed && !session.booking && new Date(session.endsAt!) > now;
  const canUpload = viewer.manage || (session.isParticipant && live);
  const scan = !!status && (status.kind === "buka" || status.kind === "belum");
  return {
    live, timed, status, canAsk, canUpload, scan,
    // "Saya hadir" (migration 202611050003) is the main way in; the QR stays beside it.
    selfCheckIn: scan && !!attendance.selfReady,
    upload: canUpload && storage,
    reschedule: canAsk && !requests.some(request => request.status === "diajukan"),
    attendanceLink: viewer.staff && live,
  };
}

/**
 * Detail sesi on its own page (Penpot P3): the title, the content, and the action bar at the
 * bottom. The page around it (app/wam/sessions/[id]) reads the data; Agenda and Beranda show the
 * same content in a sheet (AgendaSheet), with the title in the sheet's head and the actions in
 * its foot.
 */
export function SessionDetail(props: Props) {
  return <>
    <SessionDetailBody {...props} showTitle />
    {sessionDetailActions(props)}
  </>;
}

/**
 * Detail sesi's content (Penpot P3, E2): the title (on its own page) and its tags, the check-in
 * status, when, where and who, the material, and the schedule requests. A draft says its time is
 * not set yet.
 */
export function SessionDetailBody(props: Props & { showTitle?: boolean }) {
  const { view: { session, documents, storage, requests, rooms, viewer, attendance }, now, showTitle } = props;
  const { live, timed, status, canAsk, canUpload } = rights(props);
  const people = session.participants ?? [];
  return <div className={rows.detail}>
    <div className={rows.detailHead}>
      {showTitle && <h1 className={rows.detailTitle}>{session.title}</h1>}
      <div className={styles.pills}>
        <span className={`${styles.pill} ${styles.pillLine}`}>{sessionKindLabels[session.kind]}</span>
        {!live && <span className={`${styles.pill} ${styles.pillBrass}`}>{sessionStatusLabels[session.status]}</span>}
        {session.booking && <span className={`${styles.pill} ${styles.pillLine}`}>{bookingSessionLabel(session)}</span>}
      </div>
      {status && (attendance.selfReady
        ? <SelfCheckIn sessionId={session.id} status={status} now={now.toISOString()} selfReady />
        : <CheckInBlock status={status} now={now} />)}
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
  </div>;
}

/**
 * Detail sesi's buttons (scan to check in, upload material, ask for another time; panitia: QR and
 * attendance, change), or null when there is nothing to do. `bare` drops the bar's own frame for
 * the sheet's foot.
 */
export function sessionDetailActions(props: Props, bare = false) {
  const { view: { session, viewer } } = props;
  const { timed, scan, selfCheckIn, upload, reschedule, attendanceLink } = rights(props);
  if (!scan && !upload && !reschedule && !attendanceLink && !viewer.manage) return null;
  return <SessionActions scanHref={scan ? praWamPath.scan : null} scanSecondary={selfCheckIn} upload={upload} reschedule={reschedule} bare={bare}>
    {attendanceLink && <a className="button button--secondary" href={praWamPath.sessionAttendance(session.id)}><ClipboardList size={18} aria-hidden /> QR dan daftar hadir</a>}
    {viewer.manage && <a className="button button--secondary" href={praWamPath.editSession(session.id)}><Pencil size={18} aria-hidden /> {timed ? "Ubah sesi" : "Atur jadwal"}</a>}
  </SessionActions>;
}

/** A participant's session that is not published (yet), or was cancelled: say so, not "not found". */
export function WaitingSession({ session, bare }: { session: Pick<Session, "title" | "status" | "planFrom" | "planTo" | "startsAt" | "endsAt">; bare?: boolean }) {
  const cancelled = session.status === "batal";
  const box = <div className={rows.waiting}>
    <span className={styles.tile}><CalendarClock aria-hidden /></span>
    <div>
      <strong>{cancelled ? "Sesi ini dibatalkan" : "Jadwal belum ditentukan"}</strong>
      <p>{cancelled ? "Sesi ini tidak lagi ada di agenda kamu." : "Panitia belum menerbitkan sesi ini. Kamu diberi tahu begitu jadwalnya terbit."}</p>
      {!cancelled && <p className={styles.meta}>Rencana: {sessionWhen(session)}</p>}
    </div>
  </div>;
  // In the sheet the title is the sheet's own and closing it is the way back.
  if (bare) return box;
  return <>
    <h1 className={rows.detailTitle}>{session.title}</h1>
    {box}
    <SessionActions scanHref={null} upload={false} reschedule={false}><a className="button button--secondary" href={praWamPath.agenda}><CalendarDays size={18} aria-hidden /> Kembali ke agenda</a></SessionActions>
  </>;
}
