"use client";

import { useState } from "react";
import { WeekCalendar } from "@/components/pra-wam/BookCalendar";
import { MonthView } from "@/components/pra-wam/BookMonth";
import { MonthCalendar } from "@/components/pra-wam/MonthCalendar";
import { wibInstant, type Booking, type Room } from "@/lib/pra-wam/appraisal";
import base from "@/components/pra-wam/pra-wam.module.css";
import css from "@/components/pra-wam/book-calendar.module.css";

const room = (id: string, name: string, capacity: number): Room => ({ id, slug: id, name, kind: "utama", capacity, bookable: true, minPeople: null, planKey: null, facilities: [] });
const rooms = [room("r1", "CFC Ananta Room", 6), room("r2", "Nagapadma", 10), room("r3", "Vasuki", 30), room("r4", "Antareja", 12), room("r5", "Limasan", 50), room("r6", "Communal Space", 10)];
const booking = (id: string, roomId: string, date: string, start: string, end: string, title: string, by = "lain", session = false): Booking => ({
  id, roomId, title, description: "", startsAt: wibInstant(date, start), endsAt: wibInstant(date, end),
  bookedBy: { id: by, name: by === "me" ? "Mido" : "Sari", department: "Finance" }, participants: null, ...(session ? { isSession: true } : {}),
});
const bookings: Booking[] = [
  booking("a", "r6", "2026-11-09", "09:00", "10:30", "Sinkronisasi antardepartemen", "me"),
  booking("b", "r6", "2026-11-09", "13:00", "13:30", "Appraisal Bima"),
  booking("c", "r6", "2026-11-10", "07:00", "09:00", "Sarapan tim"),
  booking("d", "r6", "2026-11-11", "15:30", "17:00", "Forum CSM", "panitia", true),
  booking("e", "r6", "2026-11-13", "19:00", "22:00", "Persiapan WAM"),
  booking("f", "r1", "2026-11-09", "10:00", "11:00", "Review KPI", "me"),
  booking("g", "r2", "2026-11-09", "11:00", "12:00", "Appraisal Sales"),
  booking("h", "r3", "2026-11-09", "14:00", "15:00", "Appraisal Finance"),
  booking("i", "r4", "2026-11-12", "09:00", "10:00", "Budget 2027"),
  booking("j", "luar", "2026-11-14", "10:00", "13:00", "Survei venue WAM"),
];
const sample = async () => bookings;
const week = ["2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13"];

/** Book's week and month views with sample bookings, in the page's two-column layout. */
export function BookPreview({ view }: { view: string }) {
  const [roomId, setRoomId] = useState("r6");
  const [month, setMonth] = useState("2026-11");
  const now = new Date(wibInstant("2026-11-10", "11:20"));
  return <div className={base.app} style={{ minHeight: "100vh", padding: 20 }}>
    <div className={css.layout}>
      <div className={css.side}>
        <MonthCalendar from="2026-10-28" to="2026-11-20" selected="2026-11-10" today="2026-11-10" onPick={() => undefined} />
      </div>
      <div className={css.main}>
        {view === "bulan"
          ? <MonthView month={month} rooms={rooms} viewerId="me" today="2026-11-10" selected="2026-11-10" summary={{ "2026-11-12": { bookings: 0, full: false }, "2026-11-13": { bookings: 9, full: true } }} version={0}
            onMonth={setMonth} onPickDay={() => undefined} onOpen={() => undefined} load={sample} />
          : <div className={css.deskWeek}><WeekCalendar week={week} rooms={rooms} bookings={bookings} viewerId="me" now={now} today="2026-11-10" selected="2026-11-10" canBook
            roomId={roomId} onRoom={setRoomId} onPickDay={() => undefined} onWeek={() => undefined} onOpen={() => undefined} onBook={() => undefined} /></div>}
      </div>
    </div>
  </div>;
}
