"use client";

import { useState } from "react";
import type { TimelineEntry } from "@/lib/pra-wam/timeline";
import { BookSheet, type BookAsk } from "./BookSheet";
import { DayRooms, type DayLoader } from "./DayRooms";
import { dayName, TimelineMonth } from "./TimelineMonth";
import css from "./timeline.module.css";

/**
 * Timeline's calendar (11 Nov 2026): one month of TimelineMonth, each forum or event a bar of its
 * colour, named once in the legend below the month. A day is picked (today at first) and below the
 * calendar every room shows that day as a card (DayRooms): what is left, and its bookings with who
 * booked. "Book" on a card opens the booking form on that day and room in a sheet over the page
 * (BookSheet), so booking never leaves Timeline; saved, the cards are read again. `canBook` false
 * (Book closed): no Book buttons.
 */
export function TimelineCalendar({ entries, today, canBook = false, viewerId = "", loadDay }: { entries: TimelineEntry[]; today: string; canBook?: boolean; viewerId?: string; loadDay?: DayLoader }) {
  const [picked, setPicked] = useState(today);
  const [ask, setAsk] = useState<BookAsk | null>(null);
  const [round, setRound] = useState(0);
  return <>
    <TimelineMonth entries={entries} today={today} open={picked} legend day={(date, marks, number) =>
      <button key={date} type="button" className={`${css.calDay} ${css.calDayPick}`} {...marks} aria-pressed={date === picked}
        aria-label={`${dayName(date)}${date === today ? ", hari ini" : ""}`} onClick={() => setPicked(date)}>
        <span>{number}</span>
      </button>} />
    <DayRooms date={picked} today={today} canBook={canBook} round={round} onBook={room => setAsk({ date: picked, room })} load={loadDay} />
    <BookSheet ask={ask} viewerId={viewerId} onClose={() => { setAsk(null); setRound(value => value + 1); }} />
  </>;
}
