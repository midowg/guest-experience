import { notFound } from "next/navigation";
import { BookingForm } from "@/components/pra-wam/BookingForm";
import { wibInstant, type Booking, type Room } from "@/lib/pra-wam/appraisal";
import base from "@/components/pra-wam/pra-wam.module.css";

export const dynamic = "force-dynamic";

const room = (id: string, name: string, capacity: number): Room => ({ id, slug: id, name, kind: "utama", capacity, bookable: true, minPeople: null, planKey: null, facilities: [] });
const rooms = [room("cfc", "CFC Ananta Room", 4), room("gmsm", "GMSM Room", 6), room("limasan", "Limasan", 50)];
const DATE = "2026-11-20";
const booking = (roomId: string, title: string, start: string, end: string, name: string, others: number): Booking => ({
  id: `${roomId}-${start}`, roomId, title, description: "", startsAt: wibInstant(DATE, start), endsAt: wibInstant(DATE, end),
  bookedBy: { id: name, name, department: "" }, participants: null, others,
});

/** Layout check for the booking form's Kapan step with the day's rooms (11 Nov 2026): ?tema=terang for light. Another day cannot be read here. */
export default async function DevBookingFormPage({ searchParams }: { searchParams: Promise<{ tema?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { tema } = await searchParams;
  return <div data-wam-look="dream" data-wam-theme={tema === "terang" ? "light" : "dark"}>
    <div className={base.app} style={{ minHeight: "100vh", padding: 20, maxWidth: 640 }}>
      <BookingForm initial={{ date: DATE, start: "10:00", end: "11:00", roomId: "", title: "", description: "", participants: [] }} dates={[DATE]} now={new Date().toISOString()}
        rooms={rooms} people={[]} viewer={{ id: "me" }} groups={[]} usedTitles={[]} dayOf={DATE} showPlan={false}
        dayBookings={[booking("cfc", "Meeting ACS", "09:00", "10:30", "Sofyan", 3), booking("cfc", "Meeting RAB WAM 2027", "13:00", "15:30", "Hanung", 4), booking("gmsm", "Appraisal team SM", "14:30", "16:00", "Raja", 1)]} />
    </div>
  </div>;
}
