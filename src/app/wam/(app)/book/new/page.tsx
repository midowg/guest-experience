import { BookingForm } from "@/components/pra-wam/BookingForm";
import { ScreenHead } from "@/components/pra-wam/PraWamShell";
import { Notice } from "@/components/ui";
import { dayLabel } from "@/lib/pra-wam/appraisal";
import { booksRooms, NO_BOOKING_TEXT } from "@/lib/pra-wam/roles";
import { praWamPath } from "@/lib/routes";
import { ServiceError } from "@/lib/server/config";
import { bookingFormData, type BookingFormQuery } from "@/lib/server/pra-wam/booking-form";
import { appraisalOpen } from "@/lib/server/pra-wam/events";
import { requireMemberPage } from "@/lib/server/pra-wam/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Book ruang · WAM", robots: { index: false } };

/**
 * The booking form as its own page, new or (with ?edit=id) one of the person's own bookings, for
 * links that point here (a notification, an older link). In the app the same form opens in a sheet
 * over Timeline and Agenda (BookSheet, 9 Nov 2026).
 */
export default async function BookRoomPage({ searchParams }: { searchParams: Promise<BookingFormQuery> }) {
  const query = await searchParams;
  const member = await requireMemberPage(praWamPath.book(query));
  const top = (title: string) => <><ScreenHead eyebrow="Ruang meeting" title={title} /></>;
  if (!booksRooms(member)) return <>{top("Book ruang")}<Notice tone="info">{NO_BOOKING_TEXT}</Notice></>;
  if (!await appraisalOpen()) return <>{top("Book ruang")}<Notice tone="info">Book ruang sedang ditutup oleh admin WAM.</Notice></>;
  const loaded = await bookingFormData(member, query).catch((error: unknown) => {
    if (error instanceof ServiceError) return error.message;
    throw error;
  });
  if (typeof loaded === "string") return <>{top("Book ruang")}<Notice tone="warning">{loaded}</Notice></>;
  const { editId, initial, moved } = loaded;
  return <>
    {top(editId ? "Ubah booking" : "Book ruang")}
    {moved && <div style={{ marginBottom: 16 }}><Notice tone="info">{dayLabel(moved)} tidak bisa dibooking (sudah lewat atau di luar periode Book). Dipilih {dayLabel(initial.date)}; tanggalnya bisa diganti di bawah.</Notice></div>}
    <BookingForm editId={editId} initial={initial} dates={loaded.dates} now={loaded.now} rooms={loaded.rooms}
      people={loaded.people} groups={loaded.groups} viewer={{ id: member.id }} usedTitles={loaded.usedTitles}
      dayBookings={loaded.dayBookings} dayOf={loaded.dayOf} activities={loaded.activities} hod={loaded.hod} viewerDepartments={loaded.viewerDepartments} />
  </>;
}
