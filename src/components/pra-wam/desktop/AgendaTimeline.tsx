import { CheckCircle2, Clock, MapPin } from "lucide-react";
import { AGENDA_ITEM } from "@/lib/pra-wam/agenda";
import { clockLabel, wibTime } from "@/lib/pra-wam/appraisal";
import type { AgendaItem } from "@/lib/server/pra-wam/agenda";
import base from "../pra-wam.module.css";
import own from "./home.module.css";

const shortTime = (iso: string) => clockLabel(wibTime(iso));

/**
 * One day of the person's agenda as a timeline (Penpot P2 and the cards of E1, E2). The whole row
 * is the link, not only the title. A tap opens the item over the page (AgendaSheet: a sheet from
 * the bottom on a phone, a panel from the right on a desktop), never another page; `href` is this
 * page's address with the item open, so a new tab or a page without script still shows it.
 */
export function AgendaTimeline({ items, now, href }: { items: AgendaItem[]; now: Date; href: (item: AgendaItem) => string }) {
  const nextKey = items.find(item => new Date(item.endsAt) > now)?.key;
  return <ol className={`${base.timeline} ${own.list}`}>
    {items.map(item => {
      const done = new Date(item.endsAt) <= now;
      return <li key={item.key} className={`${base.timeItem} ${own.item}`}>
        <time dateTime={item.startsAt}>{shortTime(item.startsAt)}<small>{shortTime(item.endsAt)}</small></time>
        <span className={base.timeRail}><span className={`${base.timeDot} ${item.checkedInAt || done ? base.timeDotDone : item.key === nextKey ? base.timeDotNow : ""}`} /></span>
        <div className={base.timeBody}>
          <h3><a className={own.stretch} href={href(item)} {...{ [AGENDA_ITEM]: item.key }} aria-haspopup="dialog">{item.title}</a></h3>
          <span className={base.place}><MapPin aria-hidden />{item.where}</span>
          {(item.checkedInAt || item.key === nextKey || item.kind === "appraisal" || item.materials > 0) && <div className={base.pills}>
            {item.checkedInAt && <span className={`${base.pill} ${base.pillSuccess}`}><CheckCircle2 aria-hidden />Hadir {shortTime(item.checkedInAt)}</span>}
            {!item.checkedInAt && item.key === nextKey && <span className={base.pill}><Clock aria-hidden />Berikutnya</span>}
            {item.kind === "appraisal" && <span className={`${base.pill} ${base.pillBrass}`}>{item.tag}</span>}
            {item.materials > 0 && <span className={`${base.pill} ${base.pillLine}`}>Bahan {item.materials}</span>}
          </div>}
        </div>
      </li>;
    })}
  </ol>;
}
