"use client";

import type { OfficeBooking } from "@/lib/booking/rules";
import { clockAt, clockLabel, clockMinutes, dayMinutes, nowOffset, overlaps, roomKeptFrom, wibInstant, wibTime, bookableFrom, type Room } from "@/lib/pra-wam/appraisal";
import css from "./booking.module.css";

const STEP = 30;
const HOURS = Array.from({ length: dayMinutes / 60 + 1 }, (_, index) => index);
const pct = (minutes: number) => `${(minutes / dayMinutes) * 100}%`;
const offset = (iso: string) => Math.max(0, Math.min(dayMinutes, clockMinutes(wibTime(iso)) - clockMinutes(clockAt(0))));

/**
 * Every room's day on one grid, 07.00–22.00 (rooms down, hours across), as Skedda and Eptura show
 * it: taken time in grey with what it is, the person's own in orange, time gone hatched, a line at
 * now, and the searched hours outlined. Each empty half hour is a button that books from there.
 * Wider than a phone, so it scrolls sideways inside its own box.
 */
export function RoomGrid({ date, rooms, bookings, now, departments, selected, onPick }: {
  date: string; rooms: Room[]; bookings: OfficeBooking[]; now: string; departments: string[];
  selected: { start: string; minutes: number } | null;
  onPick: (roomId: string, start: string) => void;
}) {
  const at = new Date(now);
  const gone = bookableFrom(date, at);
  const line = nowOffset(date, at);
  const picked = selected ? { from: clockMinutes(selected.start) - clockMinutes(clockAt(0)), length: selected.minutes } : null;

  return <section className={css.section} aria-labelledby="grid-title">
    <h2 id="grid-title">Jadwal semua ruangan</h2>
    <p className={css.legend} aria-hidden>
      <span><i className={css.swFree} />Kosong, ketuk untuk booking</span>
      <span><i className={css.swBusy} />Terisi</span>
      <span><i className={css.swMine} />Booking saya</span>
      <span><i className={css.swPast} />Sudah lewat</span>
    </p>
    <div className={css.gridScroll}>
      <div className={css.grid}>
        <div className={css.gridHead} aria-hidden>
          <span className={css.gridCorner}>Ruangan</span>
          <div className={css.gridHours}>{HOURS.map(hour => <span key={hour} style={{ left: pct(hour * 60) }}>{clockLabel(clockAt(hour * 60)).slice(0, 2)}</span>)}</div>
        </div>
        {rooms.map(room => {
          const uses = bookings.filter(item => item.roomId === room.id);
          const kept = roomKeptFrom(room, departments);
          const cells = Array.from({ length: dayMinutes / STEP }, (_, index) => index * STEP).filter(from => {
            if (from < gone || kept) return false;
            const span = { startsAt: wibInstant(date, clockAt(from)), endsAt: wibInstant(date, clockAt(from + STEP)) };
            return !uses.some(item => overlaps(item, span));
          });
          return <div key={room.id} className={css.gridRow}>
            <span className={css.gridRoom}>{room.name}{kept && <small>{kept}</small>}</span>
            <div className={css.gridTrack}>
              {gone > 0 && <span className={css.gridPast} style={{ width: pct(gone) }} aria-hidden />}
              {cells.map(from => <button key={from} type="button" className={css.gridCell} style={{ left: pct(from), width: pct(STEP) }}
                aria-label={`Booking ${room.name} mulai ${clockLabel(clockAt(from))}`} onClick={() => onPick(room.id, clockAt(from))} />)}
              {uses.map(item => {
                const from = offset(item.startsAt), to = offset(item.endsAt);
                if (to <= from) return null;
                return <span key={item.id} className={item.mine ? css.gridMine : css.gridBusy} style={{ left: pct(from), width: pct(to - from) }}
                  title={`${clockLabel(wibTime(item.startsAt))}–${clockLabel(wibTime(item.endsAt))} · ${item.title} · ${item.mine ? "Booking saya" : item.bookedBy.name}`}>
                  <b>{item.title}</b><small>{clockLabel(wibTime(item.startsAt))}–{clockLabel(wibTime(item.endsAt))}</small>
                </span>;
              })}
              {picked && <span className={css.gridWindow} style={{ left: pct(picked.from), width: pct(picked.length) }} aria-hidden />}
              {line != null && <span className={css.gridNow} style={{ left: pct(line) }} aria-hidden />}
            </div>
          </div>;
        })}
      </div>
    </div>
  </section>;
}
