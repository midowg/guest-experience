"use client";

import { TimelineCalendar } from "@/components/pra-wam/TimelineCalendar";
import { wibInstant, type Booking, type Room } from "@/lib/pra-wam/appraisal";
import type { TimelineEntry } from "@/lib/pra-wam/timeline";

const room = (id: string, name: string, capacity: number): Room => ({ id, slug: id, name, kind: "utama", capacity, bookable: true, minPeople: null, planKey: null, facilities: [] });
const rooms = [room("cfc", "CFC Ananta Room", 4), room("gmsm", "GMSM Room", 6), room("limasan", "Limasan", 50)];
const booking = (date: string, roomId: string, title: string, start: string, end: string, name: string, others: number): Booking => ({
  id: `${date}-${roomId}-${start}`, roomId, title, description: "", startsAt: wibInstant(date, start), endsAt: wibInstant(date, end),
  bookedBy: { id: name, name, department: "" }, participants: null, others,
});
/** Sample bookings for the layout check, Monday 9 Nov 2026 and the day after. */
const days: Record<string, Booking[]> = {
  "2026-11-09": [
    booking("2026-11-09", "cfc", "Meeting ACS", "09:00", "10:30", "Sofyan", 3), booking("2026-11-09", "cfc", "Meeting RAB WAM 2027", "13:00", "15:30", "Hanung", 4),
    booking("2026-11-09", "gmsm", "Appraisal team SM", "14:30", "16:00", "Raja", 1),
  ],
  "2026-11-10": [booking("2026-11-10", "limasan", "Internal Departemen SS", "13:00", "15:00", "Dewi", 12)],
};

/** The same loader every render, so the day is read once per pick. */
const loadDay = async (date: string) => ({ rooms, bookings: days[date] ?? [] });

/** Timeline's calendar with sample rooms, so the layout can be checked without signing in. */
export function SampleTimeline({ entries }: { entries: TimelineEntry[] }) {
  return <TimelineCalendar entries={entries} today="2026-11-09" canBook loadDay={loadDay} />;
}
