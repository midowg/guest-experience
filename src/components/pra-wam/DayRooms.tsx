"use client";

import { useEffect, useState } from "react";
import { CalendarPlus, User } from "lucide-react";
import { Notice } from "@/components/ui";
import { appraisalRules, dayLabel, type Booking, type Room } from "@/lib/pra-wam/appraisal";
import { roomCards, type RoomCard } from "@/lib/pra-wam/room-card";
import { praWamApi } from "@/lib/routes";
import { errorText, praWamRequest } from "./api";
import css from "./day-rooms.module.css";

/** Reads one day's rooms and bookings; it must stay the same function between renders. */
export type DayLoader = (date: string) => Promise<{ rooms: Room[]; bookings: Booking[] }>;
const fromServer: DayLoader = date => praWamRequest<{ rooms: Room[]; bookings: Booking[] }>(praWamApi.bookings(undefined, { date })).then(result => result.data);

/**
 * Timeline's day below the calendar (11 Nov 2026): every room on the day picked (today at first),
 * as the card panitia shared: name and Book, capacity, what is left of the day, then its bookings
 * with who booked them. A new day is read from GET /api/wam/appraisal?date= (`load`, unless a
 * layout check gives its own); `round` reads it again (after a booking is saved).
 */
export function DayRooms({ date, today, canBook, round = 0, onBook, load = fromServer }: { date: string; today: string; canBook: boolean; round?: number; onBook: (roomId: string) => void; load?: DayLoader }) {
  const [loaded, setLoaded] = useState<{ key: string; rooms: Room[]; bookings: Booking[] } | null>(null);
  const [error, setError] = useState<{ key: string; text: string } | null>(null);
  const key = `${date}|${round}`;

  useEffect(() => {
    let live = true;
    load(date)
      .then(result => { if (live) setLoaded({ key, rooms: result.rooms, bookings: result.bookings }); })
      .catch(problem => { if (live) setError({ key, text: errorText(problem) }); });
    return () => { live = false; };
  }, [key, date, load]);

  const title = <h2 className={css.heading}>{date === today ? "Hari ini" : "Ruang"} · {dayLabel(date)}</h2>;
  if (error?.key === key) return <section className={css.day} aria-label={`Ruang ${dayLabel(date)}`}>{title}<Notice tone="error">{error.text}</Notice></section>;
  if (loaded?.key !== key) return <section className={css.day} aria-label={`Ruang ${dayLabel(date)}`} aria-busy="true">{title}<p className={css.loading} role="status">Memuat ruang…</p></section>;
  const cards = roomCards(loaded.rooms, loaded.bookings, date, new Date());
  const inPeriod = date >= appraisalRules.periodStart && date <= appraisalRules.periodEnd;
  return <section className={css.day} aria-label={`Ruang ${dayLabel(date)}`}>
    {title}
    {cards.length === 0 ? <p className={css.loading}>Belum ada ruang yang bisa dibooking.</p>
      : <ul className={css.cards}>{cards.map(card => <li key={card.room.id}><Card card={card} book={canBook && inPeriod && card.room.bookable ? () => onBook(card.room.id) : null} /></li>)}</ul>}
  </section>;
}

function Card({ card, book }: { card: RoomCard; book: (() => void) | null }) {
  const { room, left, free, blocks, items } = card;
  return <article className={css.card} aria-label={room.name}>
    <div className={css.top}>
      <h3 className={css.name}>{room.name}</h3>
      {book && <button type="button" className={css.book} onClick={book} aria-label={`Book ${room.name}`}><CalendarPlus size={18} aria-hidden />Book</button>}
    </div>
    <div className={css.use}>
      <span className={css.capacity} title="Kapasitas"><User aria-hidden />{room.capacity ?? "–"}<span className="sr-only"> orang</span></span>
      <div className={css.bar} role="img" aria-label={`${left}${items.length ? `, ${items.length} booking` : ""}`}>
        <span className={css.free} style={{ flexGrow: free }}><span>{left}</span></span>
        {blocks.map(block => <span key={block.id} className={css.block} data-tone={block.tone} style={{ flexGrow: block.share }} />)}
      </div>
    </div>
    {items.length > 0 && <ul className={css.items}>{items.map(item => <li key={item.id}>
      <span className={css.dot} data-tone={item.tone} aria-hidden />
      <span className={css.what}><span className={css.title}>{item.title}</span><small>{item.time}</small></span>
      <span className={css.who}>{item.who}</span>
    </li>)}</ul>}
  </article>;
}
