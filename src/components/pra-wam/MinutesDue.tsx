import { ChevronRight, NotebookPen } from "lucide-react";
import { clockLabel, dayLabel, wibDate, wibTime } from "@/lib/pra-wam/appraisal";
import type { Session } from "@/lib/pra-wam/sessions";
import { praWamPath } from "@/lib/routes";
import css from "./minutes.module.css";

const SHOWN = 5;

/**
 * Agenda's reminder (11 Nov 2026): the person's meetings that are over and have no MoM yet, each
 * opening its detail, where anyone who took part writes it. Nothing when there are none.
 */
export function MinutesDue({ sessions }: { sessions: Session[] }) {
  if (!sessions.length) return null;
  return <section className={css.due} aria-labelledby="mom-due">
    <p id="mom-due" className={css.title}><NotebookPen size={18} aria-hidden /> Notulen belum diisi <span className={css.count}>{sessions.length}</span></p>
    <p className={css.dueLead}>Meeting yang sudah selesai ini menunggu MoM. Siapa pun yang ikut bisa menulisnya.</p>
    <ul className={css.dueList}>{sessions.slice(0, SHOWN).map(session => <li key={session.id}>
      <a className={css.dueRow} href={praWamPath.session(session.id)}>
        <span className={css.actionText}><strong>{session.title}</strong><small>{dayLabel(wibDate(session.startsAt!))} · {clockLabel(wibTime(session.startsAt!))}–{clockLabel(wibTime(session.endsAt!))}</small></span>
        <span className={css.dueGo}>Tulis<ChevronRight size={18} aria-hidden /></span>
      </a>
    </li>)}</ul>
    {sessions.length > SHOWN && <p className={css.dueLead}>dan {sessions.length - SHOWN} meeting lain.</p>}
  </section>;
}
