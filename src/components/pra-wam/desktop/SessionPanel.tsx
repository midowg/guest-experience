import { ArrowLeftRight, CalendarClock, CalendarDays, MapPin, Upload, Users } from "lucide-react";
import { checkInStatus } from "@/lib/pra-wam/agenda";
import { clockLabel, wibTime } from "@/lib/pra-wam/appraisal";
import { sessionKindLabels, sessionWhen, sessionWhere } from "@/lib/pra-wam/sessions";
import { praWamPath } from "@/lib/routes";
import { myAttendance, type AgendaItem } from "@/lib/server/pra-wam/agenda";
import { listDocuments } from "@/lib/server/pra-wam/documents";
import { myRequests } from "@/lib/server/pra-wam/requests";
import { getSession } from "@/lib/server/pra-wam/sessions";
import type { Member } from "@/lib/server/pra-wam/session";
import { CheckInBlock } from "../CheckInStatus";
import type { SessionIntent } from "../SessionActions";
import { DocRows } from "./DocRows";
import base from "../pra-wam.module.css";
import own from "./home.module.css";

/**
 * The right side of Agenda on a desktop (Penpot E2): the selected session in full, the check-in
 * status, its documents, and the way to upload or ask for another time. Those two open the
 * session's own page with the form already open (#unggah-materi, #ganti-jadwal). An appraisal
 * booking shows a short card pointing to the room schedule.
 */
export async function SessionPanel({ item, member }: { item: AgendaItem | undefined; member: Member }) {
  if (!item) return <section className={`${base.card} ${own.empty}`}>Tidak ada agenda di hari ini. Pilih hari lain untuk melihat rinciannya.</section>;
  if (item.kind === "appraisal" || !item.sessionId) {
    return <section className={`${base.card} ${own.col} ${own.roomy}`} aria-label={`Rincian ${item.title}`}>
      <div className={own.panelHead}><div className={base.pills}><span className={`${base.pill} ${base.pillBrass}`}>Book ruang</span></div><h2>{item.title}</h2></div>
      <div className={own.tiles}>
        <div className={own.tileBox}><span className={base.tile}><CalendarDays aria-hidden /></span><span><small>Waktu</small><strong>{clockLabel(wibTime(item.startsAt))}–{clockLabel(wibTime(item.endsAt))}</strong></span></div>
        <div className={own.tileBox}><span className={base.tile}><MapPin aria-hidden /></span><span><small>Booking</small><strong>{item.where}</strong></span></div>
      </div>
      <div className={own.panelActions}><a className="button button--secondary" href={item.href}><CalendarClock size={18} aria-hidden /> Buka booking</a></div>
    </section>;
  }
  const [session, { documents, storage }, attendance, requests] = await Promise.all([
    getSession(item.sessionId, member),
    listDocuments(member, item.sessionId).catch(() => ({ documents: [], migrated: false, storage: false })),
    myAttendance(item.sessionId, member),
    myRequests(item.sessionId, member),
  ]);
  const now = new Date();
  const page = praWamPath.session(session.id);
  const open = (intent: SessionIntent) => `${page}#${intent}`;
  const status = checkInStatus(session, attendance, now);
  const live = session.status === "terbit";
  const canAsk = session.isParticipant && live && !!session.endsAt && new Date(session.endsAt) > now && !requests.some(request => request.status === "diajukan");
  const canUpload = storage && (session.isParticipant && live);
  return <section className={`${base.card} ${own.col} ${own.roomy}`} aria-label={`Rincian ${session.title}`}>
    <div className={own.panelHead}>
      <div className={base.pills}><span className={`${base.pill} ${base.pillLine}`}>{sessionKindLabels[session.kind]}</span></div>
      <h2><a className={own.plain} href={page}>{session.title}</a></h2>
    </div>
    <div className={own.tiles}>
      <div className={own.tileBox}><span className={base.tile}><CalendarDays aria-hidden /></span><span><small>Waktu</small><strong>{sessionWhen(session)}</strong></span></div>
      <div className={own.tileBox}><span className={base.tile}><MapPin aria-hidden /></span><span><small>Ruang</small><strong>{sessionWhere(session)}</strong></span></div>
      <div className={own.tileBox}><span className={base.tile}><Users aria-hidden /></span><span><small>Peserta</small><strong>{session.participantCount} orang</strong></span></div>
    </div>
    {status && <CheckInBlock status={status} now={now} wide />}
    {session.description && <p className={`${base.meta} ${own.prose}`}>{session.description}</p>}
    <div>
      <p className={own.label}>Dokumen sesi</p>
      <DocRows documents={documents} empty="Belum ada dokumen untuk sesi ini." />
    </div>
    {(canUpload || canAsk) && <div className={own.panelActions}>
      {canUpload && <a className="button button--secondary" href={open("unggah-materi")}><Upload size={18} aria-hidden /> Unggah dokumen</a>}
      {canAsk && <a className="button button--secondary" href={open("ganti-jadwal")}><ArrowLeftRight size={18} aria-hidden /> Ajukan ganti jadwal</a>}
    </div>}
  </section>;
}
