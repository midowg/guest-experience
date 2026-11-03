import { CheckCircle2, Clock, MapPin } from "lucide-react";
import { clockLabel, wibTime } from "@/lib/pra-wam/appraisal";
import type { AgendaItem } from "@/lib/server/pra-wam/agenda";
import base from "../pra-wam.module.css";
import own from "./home.module.css";

const shortTime = (iso: string) => clockLabel(wibTime(iso));

/**
 * One day of the person's agenda as a timeline (Penpot P2 and the cards of E1, E2). On a phone a
 * title opens the item's own page; with `select` it opens the item in the desktop detail panel.
 */
export function AgendaTimeline({ items, now, selectedKey, select }: { items: AgendaItem[]; now: Date; selectedKey?: string; select?: (item: AgendaItem) => string | null }) {
  const nextKey = items.find(item => new Date(item.endsAt) > now)?.key;
  return <ol className={`${base.timeline} ${own.list}`}>
    {items.map(item => {
      const done = new Date(item.endsAt) <= now;
      const desktopHref = select?.(item) ?? null;
      return <li key={item.key} className={`${base.timeItem} ${item.key === selectedKey ? own.selected : ""}`}>
        <time dateTime={item.startsAt}>{shortTime(item.startsAt)}<small>{shortTime(item.endsAt)}</small></time>
        <span className={base.timeRail}><span className={`${base.timeDot} ${item.checkedInAt || done ? base.timeDotDone : item.key === nextKey ? base.timeDotNow : ""}`} /></span>
        <div className={base.timeBody}>
          <h3>
            {desktopHref ? <>
              <a className={own.phoneOnly} href={item.href}>{item.title}</a>
              <a className={own.desktopOnly} href={desktopHref} aria-current={item.key === selectedKey ? "true" : undefined}>{item.title}</a>
            </> : <a href={item.href}>{item.title}</a>}
          </h3>
          <span className={base.place}><MapPin aria-hidden />{item.where}</span>
          <div className={base.pills}>
            {item.checkedInAt && <span className={`${base.pill} ${base.pillSuccess}`}><CheckCircle2 aria-hidden />Hadir {shortTime(item.checkedInAt)}</span>}
            {!item.checkedInAt && item.key === nextKey && <span className={base.pill}><Clock aria-hidden />Berikutnya</span>}
            <span className={`${base.pill} ${base.pillLine}`}>{item.tag}</span>
          </div>
        </div>
      </li>;
    })}
  </ol>;
}
