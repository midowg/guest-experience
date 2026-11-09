"use client";

import { useState } from "react";
import type { TimelineEntry } from "@/lib/pra-wam/timeline";
import { praWamPath } from "@/lib/routes";
import { BookSheet, type BookAsk } from "./BookSheet";
import { dayName, TimelineMonth } from "./TimelineMonth";
import css from "./timeline.module.css";

/**
 * Timeline's calendar (9 Nov 2026): one month of TimelineMonth, a bar jumping to its card in the
 * list below. On a phone the bars are thin lines; from a tablet up they carry the title. Every day
 * opens the booking form on it in a sheet over the page (BookSheet: from the bottom on a phone, from
 * the right on a desktop), so booking never leaves Timeline. Weekends too, since "Di luar kantor" can
 * be booked then; a day that cannot be booked offers the nearest one. The link still points at the
 * booking page, for a new tab. `canBook` false (Book closed): plain days.
 */
export function TimelineCalendar({ entries, today, canBook = false, viewerId = "" }: { entries: TimelineEntry[]; today: string; canBook?: boolean; viewerId?: string }) {
  const [ask, setAsk] = useState<BookAsk | null>(null);
  return <>
    <TimelineMonth entries={entries} today={today} linkBars day={(date, marks, number) => canBook
      ? <a key={date} className={`${css.calDay} ${css.calDayLink}`} href={praWamPath.book({ date })} aria-label={`Book ruang, ${dayName(date)}`} aria-haspopup="dialog" {...marks}
        onClick={event => { if (event.metaKey || event.ctrlKey || event.shiftKey) return; event.preventDefault(); setAsk({ date }); }}>
        <span>{number}</span>
      </a>
      : <span key={date} className={css.calDay} {...marks}><span>{number}</span></span>} />
    <BookSheet ask={ask} viewerId={viewerId} onClose={() => setAsk(null)} />
  </>;
}
