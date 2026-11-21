import Link from "next/link";
import type { AgendaDayTab } from "@/lib/main-wam/peserta/agenda";
import { Words } from "@/components/main-wam/i18n";
import { SrOnly, cx } from "@/components/main-wam/ui";
import css from "./agenda.module.css";

/**
 * What a tab says (prototipe .dtab): a big label ("5", or "H-3" for a Persiapan day) over a small line
 * ("Sel Jan", or "1 Jan"). The date line comes as "Sel, 5 Jan"; anything that does not read that way
 * falls back to the whole text.
 */
export function tabParts(item: Pick<AgendaDayTab, "day" | "date" | "prep">): { big: string; small: string } {
  const match = /^(\S+?),?\s+(\d{1,2})\s+(\S+)$/.exec(item.date.trim());
  if (!match) return { big: item.day, small: item.date };
  const [, weekday, date, month] = match;
  return item.prep ? { big: item.day, small: `${date} ${month}` } : { big: date, small: `${weekday} ${month}` };
}

/**
 * The day tabs of Agenda (prototipe .dtabs): links, the chosen day in the address (aria-current), each
 * one a big number over the weekday and month. Today has a gold dot and is said ("hari ini"). Under
 * 300 px they wrap to two rows (the page's `dayTabs` class).
 */
export function AgendaDayTabs({ days, current, hrefOf, label, className }: {
  days: readonly AgendaDayTab[];
  current: string;
  hrefOf: (item: AgendaDayTab) => string;
  label: string;
  className?: string;
}) {
  return <nav aria-label={label} className={cx(css.dtabs, className)}>
    {days.map(item => {
      const { big, small } = tabParts(item);
      const chosen = item.key === current;
      // "Hari 2, Sel, 5 Jan": the spoken name keeps the day and the date whole.
      return <Link key={item.key} href={hrefOf(item)} className={cx(css.dtab, item.today && css.dtabToday)} aria-current={chosen ? "page" : undefined}>
        <span className={css.dtabBig} aria-hidden>{big}</span>
        <span className={css.dtabSmall} aria-hidden>{small}</span>
        <SrOnly>{item.day}, {item.date}{item.today && <Words k="ui.todaySr" />}</SrOnly>
      </Link>;
    })}
  </nav>;
}
