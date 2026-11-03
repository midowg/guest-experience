import { ArrowLeftRight, CalendarClock, CalendarDays, CheckCircle2, MapPin, Upload, Users } from "lucide-react";
import { clockLabel, wibTime } from "@/lib/pra-wam/appraisal";
import { sessionKindLabels, sessionWhen, sessionWhere } from "@/lib/pra-wam/sessions";
import { praWamPath } from "@/lib/routes";
import type { AgendaItem } from "@/lib/server/pra-wam/agenda";
import { myCheckIn } from "@/lib/server/pra-wam/attendance";
import { listDocuments } from "@/lib/server/pra-wam/documents";
import { getSession } from "@/lib/server/pra-wam/sessions";
import type { Member } from "@/lib/server/pra-wam/session";
import { DocRows } from "./DocRows";
import base from "../pra-wam.module.css";
import own from "./home.module.css";

/**
 * The right side of Agenda on a desktop (Penpot E2): the selected session in full, its documents,
 * and the way to upload or ask for another time (on the session's own page). An appraisal
 * booking shows a short card pointing to the room schedule.
 */
export async function SessionPanel({ item, member }: { item: AgendaItem | undefined; member: Member }) {
  if (!item) return <section className={`${base.card} ${own.empty}`}>Pilih agenda di kiri untuk melihat rinciannya.</section>;
  if (item.kind === "appraisal" || !item.sessionId) {
    return <section className={base.card}>
      <div className={own.panelHead}><span className={`${base.pill} ${base.pillBrass}`}>Appraisal</span><h2>{item.title}</h2></div>
      <div className={`${own.tiles} ${own.gapTop}`}>
        <div className={own.tileBox}><span className={base.tile}><CalendarDays aria-hidden /></span><span><small>Waktu</small><strong>{clockLabel(wibTime(item.startsAt))}–{clockLabel(wibTime(item.endsAt))}</strong></span></div>
        <div className={own.tileBox}><span className={base.tile}><MapPin aria-hidden /></span><span><small>Booking</small><strong>{item.where}</strong></span></div>
      </div>
      <div className={`${own.panelActions} ${own.gapTop}`}><a className="button button--secondary" href={item.href}><CalendarClock size={18} aria-hidden /> Lihat jadwal ruang</a></div>
    </section>;
  }
  const [session, { documents }, checkedInAt] = await Promise.all([
    getSession(item.sessionId, member),
    listDocuments(member, item.sessionId).catch(() => ({ documents: [], migrated: false, storage: false })),
    myCheckIn(item.sessionId, member),
  ]);
  const page = praWamPath.session(session.id);
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
    {session.isParticipant && <p className={own.status}><CheckCircle2 aria-hidden />{checkedInAt
      ? `Hadir · absen tercatat ${clockLabel(wibTime(checkedInAt))}.`
      : "Terdaftar · belum absen. Scan QR yang ditempel di ruang memakai ponsel Anda."}</p>}
    {session.description && <p className={`${base.meta} ${own.prose}`}>{session.description}</p>}
    <div>
      <p className={own.label}>Dokumen sesi</p>
      <DocRows documents={documents} empty="Belum ada dokumen untuk sesi ini." />
    </div>
    <div className={own.panelActions}>
      <a className="button button--secondary" href={page}><Upload size={18} aria-hidden /> Unggah dokumen</a>
      {session.isParticipant && session.status === "terbit" && <a className="button button--secondary" href={page}><ArrowLeftRight size={18} aria-hidden /> Ajukan ganti jadwal</a>}
    </div>
  </section>;
}
