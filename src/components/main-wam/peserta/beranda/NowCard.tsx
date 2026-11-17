import Link from "next/link";
import type { ReactNode } from "react";
import { CalendarCheck, CalendarDays, ChevronRight, Clock, MapPin } from "lucide-react";
import type { NowView } from "@/lib/main-wam/peserta/home";
import { mainWamPath } from "@/lib/routes";
import { Card, CardHead, StatusPill } from "@/components/main-wam/ui";
import { Until } from "../Live";
import css from "../peserta.module.css";

/**
 * Kartu Sekarang (P01, P01__status, P02): the session that matters now: its absen is open (the
 * Absen button is agen D's SessionAbsen, passed as `absen`), it runs, or it comes next; else "Hari
 * ini selesai" with tomorrow's first session. The session part opens Detail sesi; the Absen button
 * sits beside that link, never inside it.
 */
export function NowCard({ view, absen, serverNow }: { view: NowView; absen?: ReactNode; serverNow: string }) {
  if (view.kind === "kosong") {
    return <Card as="article">
      <CardHead icon={<CalendarDays />} title="Agenda belum terbit" sub="Kamu akan diberi kabar." />
    </Card>;
  }
  if (view.kind === "selesai") {
    const next = view.tomorrow;
    return <Card as="article" href={mainWamPath.agenda(next?.day ?? undefined)} aria-label={next ? `Hari ini selesai. ${next.when}, ${next.title}. Buka agenda` : "Hari ini selesai. Buka agenda"}>
      <CardHead icon={<CalendarCheck />} iconTone="success" title="Hari ini selesai" sub={next ? `${next.when} · ${next.title}` : undefined}
        end={<ChevronRight aria-hidden className={css.trailIcon} />} />
    </Card>;
  }
  const pill = view.status === "present"
    ? <StatusPill status="present">{view.statusText}</StatusPill>
    : <StatusPill status={view.status} />;
  const label = [view.title, view.status === "live" ? "sedang berlangsung" : view.status === "present" ? "sudah hadir" : view.status === "done" ? "selesai" : view.when ?? "berikutnya", "detail sesi"].join(", ");
  return <Card as="article">
    <Link href={mainWamPath.session(view.sessionId)} className={css.nowLink} aria-label={label}>
      <span className={css.nowStatus}>
        {pill}
        {view.when && <span className={css.nowWhen}>{view.whenAt ? <Until at={view.whenAt} serverNow={serverNow} initial={view.when} /> : view.when}</span>}
      </span>
      <h2 className={css.nowTitle}>{view.title}</h2>
      <span className={css.meta}>
        <span className={css.metaItem}><Clock aria-hidden /><span>{view.time}</span></span>
        {view.place && <span className={css.metaItem}><MapPin aria-hidden /><span>{view.place}</span></span>}
      </span>
    </Link>
    {view.absen && absen}
  </Card>;
}
