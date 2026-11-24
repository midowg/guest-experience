import { instantLabel, type ViewerZone } from "@/lib/pra-wam/zone";
import { CheckCircle2, Clock, MapPin } from "lucide-react";
import { AGENDA_ITEM } from "@/lib/pra-wam/agenda";
import type { AgendaItem } from "@/lib/server/pra-wam/agenda";
import base from "../pra-wam.module.css";
import own from "./home.module.css";

// 19 Nov 2026: in the viewer's own zone.
const shortTime = (iso: string, zone: ViewerZone) => instantLabel(iso, zone);

/**
 * One day of the person's agenda as a timeline (Penpot P2 and the cards of E1, E2). The whole row
 * is the link, not only the title. A tap opens the item over the page (AgendaSheet: a sheet from
 * the bottom on a phone, a panel from the right on a desktop), never another page; `href` is this
 * page's address with the item open, so a new tab or a page without script still shows it.
 */
export function AgendaTimeline({ items, now, href, zone = "WIB", direct }: { items: AgendaItem[]; now: Date; href: (item: AgendaItem) => string; zone?: ViewerZone; /** 24 Nov 2026: a page to open instead of the sheet (Misi Perjalanan's sessions), or null. */ direct?: (item: AgendaItem) => string | null }) {
  const nextKey = items.find(item => new Date(item.endsAt) > now)?.key;
  return <ol className={`${base.timeline} ${own.list}`}>
    {items.map(item => {
      const done = new Date(item.endsAt) <= now;
      return <li key={item.key} className={`${base.timeItem} ${own.item}`}>
        <time dateTime={item.startsAt}>{shortTime(item.startsAt, zone)}<small>{shortTime(item.endsAt, zone)}</small></time>
        <span className={base.timeRail}><span className={`${base.timeDot} ${item.checkedInAt || done ? base.timeDotDone : item.key === nextKey ? base.timeDotNow : ""}`} /></span>
        <div className={base.timeBody}>
          <h3>{direct?.(item) ? <a className={own.stretch} href={direct(item)!}>{item.title}</a> : <a className={own.stretch} href={href(item)} {...{ [AGENDA_ITEM]: item.key }} aria-haspopup="dialog">{item.title}</a>}</h3>
          <span className={base.place}><MapPin aria-hidden />{item.where}</span>
          {(item.checkedInAt || item.key === nextKey || item.kind === "appraisal" || item.materials > 0) && <div className={base.pills}>
            {item.checkedInAt && <span className={`${base.pill} ${base.pillSuccess}`}><CheckCircle2 aria-hidden />Hadir {shortTime(item.checkedInAt, zone)}</span>}
            {!item.checkedInAt && item.key === nextKey && <span className={base.pill}><Clock aria-hidden />Berikutnya</span>}
            {item.kind === "appraisal" && <span className={`${base.pill} ${base.pillBrass}`}>{item.tag}</span>}
            {item.materials > 0 && <span className={`${base.pill} ${base.pillLine}`}>Bahan {item.materials}</span>}
          </div>}
        </div>
      </li>;
    })}
  </ol>;
}
